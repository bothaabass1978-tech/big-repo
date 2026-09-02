// ---------------------------------------------------------------------------
// 06_textures.js — Z.Tex: all game textures, generated to <canvas> at runtime.
// No image assets. Everything below is procedural. Owner: technical-artist.
//
// Look target: a pitch-black wooden farmhouse lit by bare tungsten bulbs
// (Nacht der Untoten, WaW 2008). Warm dirty browns and dirty tan plaster,
// desaturated but never blue-grey. The renderer's fragment shader is a flat
// multiplier — albedo = texel.rgb * uTint * vCol, then * light — with no
// colour-grading pass, so warmth cannot be recovered downstream of a
// neutral or cool canvas: a cold texture stays cold under any tint or light
// colour. Warmth AND structural detail (board seams, lath, cracks, stains)
// must be baked into the canvas here, not left to lighting.
// Every material gets a mandatory final grunge pass. Nothing ships clean.
//
// Material record shape (see docs/architecture/MODULE-CONTRACTS.md):
//   { canvas, size, tile:[boolU,boolV], spec, gloss, emissive, normal, tint }
//     canvas    — the diffuse/albedo <canvas>, RGBA, power-of-two square.
//     size      — canvas.width (== canvas.height).
//     tile      — [tileU, tileV] booleans: does this texture repeat cleanly
//                 on that axis? true for structural/architectural surfaces,
//                 false for one-off decorative panels (posters, perk faces,
//                 chalk signage, blood decals) that are meant to be mapped
//                 once onto a single quad, not repeated.
//     spec      — scalar 0..1, base specular reflectance (Fresnel-ish).
//     gloss     — scalar 0..1, glossiness (inverse roughness). Low = matte.
//     emissive  — scalar 0..1, self-illumination multiplier (0 for almost
//                 everything; used for painted-glass perk glow, tiny bits).
//     normal    — <canvas>|null, tangent-space normal map (Sobel-derived
//                 from albedo luminance) for the 6 materials the renderer
//                 needs relief on. null elsewhere — flat-shaded is correct
//                 for cloth/skin/paper/etc at this texture's viewing scale.
//     tint      — [r,g,b] 0..1 multiplier, default [1,1,1]. Reserved for
//                 renderer-side recolouring; textures already bake final
//                 colour so this is normally left at identity.
//   Optional: alphaTest — scalar 0..1, default 0 (off). World geometry
//     renders opaque (gl.BLEND disabled, see 12_render.js R.beginScene) with
//     only a `texel.a < uAlphaTest -> discard` cutout, so a transparent-bg
//     decal (chalk marks, blood) MUST set this (~0.04) or its empty canvas
//     renders as solid black instead of showing the surface behind it.
//     NOT YET reflected in docs/architecture/MODULE-CONTRACTS.md -- flagging
//     for whoever owns that doc.
// ---------------------------------------------------------------------------
(function () {
  const T = {};
  Z.Tex = T;

  const RNG = Z.RNG, M = Z.M;

  // ===========================================================================
  // Sizes & seeding
  // ===========================================================================
  const HERO = 512;   // structural surfaces seen up close at scale
  const PROP = 256;   // props, signage, character skins
  const SPR_L = 96, SPR_M = 64, SPR_S = 32; // sprite/decal canvases

  let BASE_SEED = Z.ART_SEED;
  // Every material/sprite gets its own deterministic stream from a small
  // integer index, per the spec: Z.RNG.make(Z.ART_SEED + n).
  function rng(n) { return RNG.make((BASE_SEED + n * 104729) >>> 0); }

  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  }
  function ctx2d(c) { return c.getContext('2d', { willReadFrequently: true }); }

  // ===========================================================================
  // Palette ramp — the core "make noise look like dirt" primitive.
  // stops: [[t0,[r,g,b]], [t1,[r,g,b]], ...] ascending t in [0,1].
  // ===========================================================================
  function ramp(t, stops) {
    t = M.clamp01(t);
    const n = stops.length;
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 0; i < n - 1; i++) {
      const t0 = stops[i][0], t1 = stops[i + 1][0];
      if (t <= t1 || i === n - 2) {
        const f = t1 > t0 ? M.clamp01((t - t0) / (t1 - t0)) : 0;
        const c0 = stops[i][1], c1 = stops[i + 1][1];
        return [
          c0[0] + (c1[0] - c0[0]) * f,
          c0[1] + (c1[1] - c0[1]) * f,
          c0[2] + (c1[2] - c0[2]) * f,
        ];
      }
    }
    return stops[n - 1][1];
  }

  // ===========================================================================
  // baseLayer — domain-warped fbm rendered at LOW resolution (cheap: only a
  // few thousand texels), palette-mapped to colour, then scaled up with the
  // browser's own image scaler. This is the primary cost-control technique:
  // avoid full-resolution per-pixel JS loops wherever a native canvas op can
  // do the same job. finalSize/lowRes need not share a scale factor.
  // ===========================================================================
  function baseLayer(finalSize, lowRes, seedN, cfg) {
    const small = mkCanvas(lowRes);
    const sctx = ctx2d(small);
    const img = sctx.createImageData(lowRes, lowRes);
    const d = img.data;
    const offX = seedN * 137.13, offY = seedN * 91.71 + 19.7;
    const period = cfg.period || lowRes;
    const su = cfg.stretchU || 1, sv = cfg.stretchV || 1;
    const octaves = cfg.octaves || 4, gain = cfg.gain === undefined ? 0.5 : cfg.gain, lac = cfg.lac || 2.15;
    const freq = cfg.freq || 3;
    const warpAmt = cfg.warpAmt || 0, warpFreq = cfg.warpFreq || 2;
    for (let y = 0; y < lowRes; y++) {
      const v = y / lowRes;
      for (let x = 0; x < lowRes; x++) {
        const u = x / lowRes;
        let wu = u, wv = v;
        if (warpAmt) {
          const w1 = RNG.fbm2(u * warpFreq + offX, v * warpFreq + offY, 2, warpFreq, 0.5, 2);
          const w2 = RNG.fbm2(u * warpFreq + offX + 41.3, v * warpFreq + offY + 63.9, 2, warpFreq, 0.5, 2);
          wu = u + (w1 - 0.5) * warpAmt;
          wv = v + (w2 - 0.5) * warpAmt;
        }
        const n = RNG.fbm2(wu * freq * su + offX, wv * freq * sv + offY, octaves, period, gain, lac);
        const rgb = ramp(n, cfg.stops);
        const i = (y * lowRes + x) * 4;
        d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);
    const big = mkCanvas(finalSize);
    const bctx = ctx2d(big);
    bctx.imageSmoothingEnabled = true;
    if (bctx.imageSmoothingQuality) bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(small, 0, 0, finalSize, finalSize);
    return big;
  }

  // ===========================================================================
  // Voronoi cell field (low-res) — used for aggregate/gravel speckle and
  // crumbling mortar/crack boundaries. Returns {res, cellId:Uint16Array,
  // edge:Float32Array (0..1, high near cell boundary)}.
  // ===========================================================================
  function voronoiField(res, seedN, count) {
    const st = rng(seedN);
    const pts = [];
    for (let i = 0; i < count; i++) pts.push([st.f() * res, st.f() * res, st.f()]);
    const cellId = new Uint16Array(res * res);
    const edge = new Float32Array(res * res);
    // toroidal distance so the field tiles seamlessly
    const wrapd = (a) => { const w = ((a % res) + res) % res; return Math.min(w, res - w); };
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        let best = Infinity, second = Infinity, bestI = 0;
        for (let i = 0; i < pts.length; i++) {
          const dx = wrapd(x - pts[i][0]), dy = wrapd(y - pts[i][1]);
          const dd = dx * dx + dy * dy;
          if (dd < best) { second = best; best = dd; bestI = i; }
          else if (dd < second) { second = dd; }
        }
        const idx = y * res + x;
        cellId[idx] = bestI;
        edge[idx] = M.clamp01(1 - (Math.sqrt(second) - Math.sqrt(best)) * 0.6);
      }
    }
    return { res, cellId, edge, pts };
  }

  // ===========================================================================
  // Shared fine-grain atlas — ONE 512x512 white-noise canvas built once and
  // reused (via offset sub-rects) by every material's grunge pass, instead of
  // recomputing a per-pixel hash loop 39 times.
  // ===========================================================================
  let GRAIN = null;
  function grainAtlas() {
    if (GRAIN) return GRAIN;
    const size = 512;
    const c = mkCanvas(size);
    const g = ctx2d(c);
    const img = g.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = RNG.hash2(x, y) * 255;
        const i = (y * size + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    GRAIN = c;
    return c;
  }
  // Draw a `size`x`size` window of the shared grain atlas onto ctx, offset by
  // seedN so different materials don't show the exact same speckle.
  function drawGrain(ctx, size, seedN, alpha, blend) {
    const atlas = grainAtlas();
    const ox = (seedN * 71) % (512 - Math.min(size, 512));
    const oy = (seedN * 133) % (512 - Math.min(size, 512));
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 0.08 : alpha;
    ctx.globalCompositeOperation = blend || 'overlay';
    if (size <= 512) {
      ctx.drawImage(atlas, ox, oy, size, size, 0, 0, size, size);
    } else {
      for (let y = 0; y < size; y += 512) for (let x = 0; x < size; x += 512) ctx.drawImage(atlas, x, y);
    }
    ctx.restore();
  }

  // ===========================================================================
  // Grunge primitives
  // ===========================================================================
  function dab(ctx, x, y, r, rgba, blend) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgba(1));
    grad.addColorStop(1, rgba(0));
    ctx.save();
    ctx.globalCompositeOperation = blend || 'multiply';
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, r, 0, M.TAU); ctx.fill();
    ctx.restore();
  }

  // Soft dark/wet blotches — water stains, damp patches, oil, soot pooling.
  function stains(ctx, size, seedN, opts) {
    opts = opts || {};
    const st = rng(seedN + 5000);
    const count = opts.count === undefined ? 5 : opts.count;
    const color = opts.color || [10, 10, 12];
    const maxA = opts.alpha === undefined ? 0.35 : opts.alpha;
    for (let i = 0; i < count; i++) {
      const x = st.f() * size, y = st.f() * size;
      const r = size * st.range(opts.minR || 0.06, opts.maxR || 0.22);
      const a = maxA * st.range(0.5, 1);
      dab(ctx, x, y, r, (al) => `rgba(${color[0]},${color[1]},${color[2]},${(al * a).toFixed(3)})`, 'multiply');
      // wrap copies near the border so stains don't get clipped into a hard edge
      if (x < r) dab(ctx, x + size, y, r, (al) => `rgba(${color[0]},${color[1]},${color[2]},${(al * a).toFixed(3)})`, 'multiply');
      if (x > size - r) dab(ctx, x - size, y, r, (al) => `rgba(${color[0]},${color[1]},${color[2]},${(al * a).toFixed(3)})`, 'multiply');
      if (y < r) dab(ctx, x, y + size, r, (al) => `rgba(${color[0]},${color[1]},${color[2]},${(al * a).toFixed(3)})`, 'multiply');
      if (y > size - r) dab(ctx, x, y - size, r, (al) => `rgba(${color[0]},${color[1]},${color[2]},${(al * a).toFixed(3)})`, 'multiply');
    }
  }

  // General filth: many tiny dark speckles + a couple of broad soft darkening
  // blobs. Every material calls this at the end — "nothing ships clean".
  function grime(ctx, size, seedN, amount) {
    amount = amount === undefined ? 1 : amount;
    const st = rng(seedN + 6000);
    drawGrain(ctx, size, seedN + 1, 0.05 * amount, 'overlay');
    const speckles = Math.round(90 * amount * (size / 256));
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < speckles; i++) {
      const x = st.f() * size, y = st.f() * size, r = st.range(0.5, 2.5) * (size / 256);
      const a = st.range(0.08, 0.3);
      ctx.fillStyle = `rgba(8,7,6,${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, M.TAU); ctx.fill();
    }
    ctx.restore();
    // 2-3 broad soft grime blobs (corners collect dirt)
    const blobs = Math.max(2, Math.round(3 * amount));
    for (let i = 0; i < blobs; i++) {
      const x = st.f() * size, y = st.f() * size;
      const r = size * st.range(0.25, 0.5);
      dab(ctx, x, y, r, (al) => `rgba(6,6,7,${(al * 0.12 * amount).toFixed(3)})`, 'multiply');
    }
  }

  // Thin linear scuffs — metal scratches, wood scoring.
  function scratches(ctx, size, seedN, count, opts) {
    opts = opts || {};
    const st = rng(seedN + 7000);
    ctx.save();
    for (let i = 0; i < count; i++) {
      const x0 = st.f() * size, y0 = st.f() * size;
      const ang = st.f() * M.TAU;
      const len = size * st.range(0.05, opts.maxLen || 0.3);
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      const light = st.bool(0.5);
      ctx.globalCompositeOperation = light ? 'screen' : 'multiply';
      ctx.strokeStyle = light
        ? `rgba(255,255,255,${st.range(0.03, 0.1).toFixed(3)})`
        : `rgba(0,0,0,${st.range(0.08, 0.22).toFixed(3)})`;
      ctx.lineWidth = st.range(0.5, 1.6);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.restore();
  }

  // Worn/lightened traffic paths and touch points — screen-blend highlight.
  function edgeWear(ctx, size, seedN, opts) {
    opts = opts || {};
    const st = rng(seedN + 8000);
    const count = opts.count === undefined ? 3 : opts.count;
    // Optional grain-aligned stretch: worn floorboards lighten in a streak
    // that runs WITH the plank, not as a free-floating round glow. axis
    // picks the long direction ('u' = horizontal boards, 'v' = vertical);
    // stretch is the long:short axis ratio (1 = old circular dab, exactly
    // the previous behaviour, unchanged for every caller that doesn't
    // opt in -- gun_metal, brick etc. still get round handling wear).
    const stretch = opts.stretch || 1;
    const rot = opts.axis === 'v' ? M.TAU * 0.25 : 0;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < count; i++) {
      const x = opts.path ? size * (0.3 + st.f() * 0.4) : st.f() * size;
      const y = opts.path ? st.f() * size : st.f() * size;
      const r = size * st.range(0.05, 0.14);
      const a = st.range(0.04, 0.1) * (opts.amount === undefined ? 1 : opts.amount);
      const c = opts.color || [200, 190, 165];
      if (stretch === 1) {
        dab(ctx, x, y, r, (al) => `rgba(${c[0]},${c[1]},${c[2]},${(al * a).toFixed(3)})`, 'screen');
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot + st.sym(0.15));
        ctx.scale(stretch, 1 / Math.sqrt(stretch));
        dab(ctx, 0, 0, r, (al) => `rgba(${c[0]},${c[1]},${c[2]},${(al * a).toFixed(3)})`, 'screen');
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // Subtle panel-edge AO so a single repeated tile still reads as a discrete
  // panel/board rather than an infinite smear. Kept low-intensity so the
  // literal seam (forced identical below) stays imperceptible.
  function dirtAO(ctx, size, opts) {
    opts = opts || {};
    const inset = opts.inset === undefined ? size * 0.06 : opts.inset;
    const strength = opts.strength === undefined ? 0.16 : opts.strength;
    const g = ctx.createLinearGradient(0, 0, 0, 0); // placeholder, replaced per-edge below
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const edges = [
      { g: ctx.createLinearGradient(0, 0, inset, 0) },
      { g: ctx.createLinearGradient(size, 0, size - inset, 0) },
      { g: ctx.createLinearGradient(0, 0, 0, inset) },
      { g: ctx.createLinearGradient(0, size, 0, size - inset) },
    ];
    for (const e of edges) {
      e.g.addColorStop(0, `rgba(4,4,5,${strength.toFixed(3)})`);
      e.g.addColorStop(1, 'rgba(4,4,5,0)');
      ctx.fillStyle = e.g;
      ctx.fillRect(0, 0, size, size);
    }
    ctx.restore();
  }

  // Recursive branching crack walker.
  function crackPath(ctx, opts) {
    const { x, y, angle, len, depth, st, width, color } = opts;
    if (depth <= 0 || len < 2) return;
    let cx = x, cy = y, ang = angle;
    const steps = Math.max(2, Math.round(len / 4));
    ctx.save();
    ctx.strokeStyle = color || 'rgba(10,9,10,0.55)';
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let i = 0; i < steps; i++) {
      ang += st.sym(0.5);
      cx += Math.cos(ang) * (len / steps);
      cy += Math.sin(ang) * (len / steps);
      ctx.lineTo(cx, cy);
      if (st.bool(0.16) && depth > 1) {
        crackPath(ctx, { x: cx, y: cy, angle: ang + st.sym(1.2), len: len * st.range(0.35, 0.6), depth: depth - 1, st, width: width * 0.7, color });
      }
    }
    ctx.stroke();
    ctx.restore();
  }
  function crackNetwork(ctx, size, seedN, opts) {
    opts = opts || {};
    const st = rng(seedN + 9000);
    const count = opts.count === undefined ? 3 : opts.count;
    for (let i = 0; i < count; i++) {
      crackPath(ctx, {
        x: st.f() * size, y: st.f() * size, angle: st.f() * M.TAU,
        len: size * st.range(0.15, opts.maxLen || 0.45),
        depth: opts.depth || 4, st, width: opts.width || 1.4,
        color: opts.color || 'rgba(8,7,8,0.5)',
      });
    }
  }

  // ===========================================================================
  // Jittered rectangle, returned as a Path2D so a caller can clip() it and
  // later stroke() the *exact same* broken silhouette (no re-jitter drift)
  // to sell "hole broken in plaster", not "sticker pasted on wall".
  // ===========================================================================
  function jaggedRectPath(cx, cy, hw, hh, st, segs) {
    const j = Math.min(hw, hh) * 0.12;
    const p = new Path2D();
    let first = true;
    const pt = (x, y) => {
      x += st.sym(j); y += st.sym(j);
      if (first) { p.moveTo(x, y); first = false; } else p.lineTo(x, y);
    };
    for (let s = 0; s <= segs; s++) pt(M.lerp(cx - hw, cx + hw, s / segs), cy - hh);
    for (let s = 0; s <= segs; s++) pt(cx + hw, M.lerp(cy - hh, cy + hh, s / segs));
    for (let s = 0; s <= segs; s++) pt(M.lerp(cx + hw, cx - hw, s / segs), cy + hh);
    for (let s = 0; s <= segs; s++) pt(cx - hw, M.lerp(cy + hh, cy - hh, s / segs));
    p.closePath();
    return p;
  }

  // ===========================================================================
  // Board/plank primitive — shared by every wooden material.
  // axis: 'u' boards run left-right (gap lines are ~horizontal, floor-style);
  //       'v' boards run top-bottom (gap lines are ~vertical, wall-style).
  // ===========================================================================
  function boards(ctx, size, seedN, opts) {
    const st = rng(seedN + 2000);
    const axis = opts.axis || 'u';
    const count = opts.count || 8;
    const stops = opts.stops;
    const gapDark = opts.gapColor || 'rgba(6,5,4,0.9)';
    const cross = size / count; // board width across the run direction
    ctx.save();
    for (let i = 0; i < count; i++) {
      const bh = RNG.hash2(i, seedN);
      const tone = 0.25 + bh * 0.65;
      const rgb = ramp(tone, stops);
      // "newness" gates how much of the pre-baked warped base layer shows
      // through the flat per-board fill: 1 = solid opaque board (old
      // behaviour), lower = weathered wood where the base layer's own
      // mottling reads through as grain/tonal drift instead of the board
      // being a dead-flat stripe. Every tileWood() caller gets a little of
      // this for free now.
      const newness = opts.newness === undefined ? 0.86 : opts.newness;
      ctx.save();
      ctx.globalAlpha = newness;
      ctx.fillStyle = `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
      const a0 = i * cross, a1 = (i + 1) * cross;
      if (axis === 'u') ctx.fillRect(0, a0, size, cross);
      else ctx.fillRect(a0, 0, cross, size);
      ctx.restore();
      // per-board length streaks (grain running along the board's long axis)
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const streaks = Math.max(2, Math.round(cross / 8));
      for (let s = 0; s < streaks; s++) {
        const t = RNG.hash2(i * 31 + s, seedN + 17);
        const streakA = 0.06 + t * 0.1;
        ctx.fillStyle = `rgba(20,15,10,${streakA.toFixed(3)})`;
        const pos = a0 + (s + 0.5) * (cross / streaks) + (t - 0.5) * (cross / streaks) * 0.4;
        if (axis === 'u') ctx.fillRect(0, pos - 0.6, size, 1.2);
        else ctx.fillRect(pos - 0.6, 0, 1.2, size);
      }
      ctx.restore();
      // knots
      if (opts.knots && st.bool(0.55)) {
        const kx = axis === 'u' ? st.f() * size : a0 + cross * st.range(0.25, 0.75);
        const ky = axis === 'u' ? a0 + cross * st.range(0.25, 0.75) : st.f() * size;
        const kr = cross * st.range(0.18, 0.32);
        const grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
        grad.addColorStop(0, 'rgba(15,10,7,0.85)');
        grad.addColorStop(0.5, 'rgba(25,17,11,0.55)');
        grad.addColorStop(1, 'rgba(25,17,11,0)');
        ctx.save(); ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.ellipse(kx, ky, kr, kr * 0.7, st.f() * M.TAU, 0, M.TAU); ctx.fill();
        ctx.restore();
      }
      // occasional rot/damp darkening near one end of a board
      if (opts.rot && st.bool(0.35)) {
        const along = st.f();
        const rx = axis === 'u' ? along * size : a0 + cross / 2;
        const ry = axis === 'u' ? a0 + cross / 2 : along * size;
        dab(ctx, rx, ry, cross * st.range(0.8, 1.6), (al) => `rgba(8,7,6,${(al * 0.4).toFixed(3)})`, 'multiply');
      }
    }
    // gap lines: dark seam + a thin offset highlight, so each seam reads
    // as a physical bevel (and gives the Sobel normal map, derived from
    // this same albedo, an actual edge to bump instead of a flat line).
    const wob = opts.wobble === undefined ? 1.5 : opts.wobble;
    const steps = 12;
    const gw = opts.gapWidth || 2;
    for (let i = 1; i < count; i++) {
      const p = i * cross;
      const pts = [];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const w = Math.sin(t * M.TAU * 2 + i) * wob + (RNG.hash2(i * 97 + s, seedN) - 0.5) * wob;
        pts.push(axis === 'u' ? [t * size, p + w] : [p + w, t * size]);
      }
      const strokePath = (offX, offY) => {
        ctx.beginPath();
        pts.forEach(([x, y], s) => { if (s === 0) ctx.moveTo(x + offX, y + offY); else ctx.lineTo(x + offX, y + offY); });
        ctx.stroke();
      };
      ctx.strokeStyle = gapDark;
      ctx.lineWidth = gw;
      strokePath(0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = 'rgba(180,165,140,0.10)';
      ctx.lineWidth = gw * 0.6;
      strokePath(axis === 'u' ? 0 : gw * 0.9, axis === 'u' ? gw * 0.9 : 0);
      ctx.restore();
    }
    // nails: two neat rows per board near each end, dark pinprick + tiny highlight
    if (opts.nails) {
      const nailCols = axis === 'u' ? [size * 0.06, size * 0.94] : null;
      for (let i = 0; i < count; i++) {
        const c0 = i * cross + cross * 0.5;
        const positions = axis === 'u'
          ? [[size * 0.06, c0], [size * 0.94, c0], [size * 0.5, c0]]
          : [[c0, size * 0.06], [c0, size * 0.94], [c0, size * 0.5]];
        for (const [nx, ny] of positions) {
          if (!st.bool(0.85)) continue;
          ctx.fillStyle = 'rgba(15,13,12,0.8)';
          ctx.beginPath(); ctx.arc(nx, ny, 1.6, 0, M.TAU); ctx.fill();
          ctx.fillStyle = 'rgba(120,110,95,0.4)';
          ctx.beginPath(); ctx.arc(nx - 0.5, ny - 0.5, 0.6, 0, M.TAU); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // ===========================================================================
  // Sobel normal map from a canvas's luminance. Rendered at half the source
  // resolution (relief detail doesn't need full-res, and it's 4x cheaper).
  // ===========================================================================
  function sobelNormal(srcCanvas, outSize) {
    const small = mkCanvas(outSize);
    const sctx = ctx2d(small);
    sctx.drawImage(srcCanvas, 0, 0, outSize, outSize);
    const img = sctx.getImageData(0, 0, outSize, outSize);
    const d = img.data;
    const lum = new Float32Array(outSize * outSize);
    for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
      lum[i] = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) / 255;
    }
    const out = mkCanvas(outSize);
    const octx = ctx2d(out);
    const oimg = octx.createImageData(outSize, outSize);
    const od = oimg.data;
    const strength = 2.2;
    for (let y = 0; y < outSize; y++) {
      const ym = (y - 1 + outSize) % outSize, yp = (y + 1) % outSize;
      for (let x = 0; x < outSize; x++) {
        const xm = (x - 1 + outSize) % outSize, xp = (x + 1) % outSize;
        const tl = lum[ym * outSize + xm], tc = lum[ym * outSize + x], tr = lum[ym * outSize + xp];
        const cl = lum[y * outSize + xm], cr = lum[y * outSize + xp];
        const bl = lum[yp * outSize + xm], bc = lum[yp * outSize + x], br = lum[yp * outSize + xp];
        const gx = (tr + 2 * cr + br) - (tl + 2 * cl + bl);
        const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
        let nx = -gx * strength, ny = -gy * strength, nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= len; ny /= len; nz /= len;
        const i = (y * outSize + x) * 4;
        od[i] = (nx * 0.5 + 0.5) * 255;
        od[i + 1] = (ny * 0.5 + 0.5) * 255;
        od[i + 2] = (nz * 0.5 + 0.5) * 255;
        od[i + 3] = 255;
      }
    }
    octx.putImageData(oimg, 0, 0);
    return out;
  }

  // ===========================================================================
  // forceSeamEdges — literal border-pixel equality so left/right and
  // top/bottom edges match exactly. Only touches a 1px ring (imperceptible)
  // and runs LAST, after all vector overlays, so it always wins.
  // ===========================================================================
  function forceSeamEdges(canvas) {
    const size = canvas.width;
    const ctx = ctx2d(canvas);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      const rowStart = y * size * 4;
      const lastCol = rowStart + (size - 1) * 4;
      d[lastCol] = d[rowStart]; d[lastCol + 1] = d[rowStart + 1];
      d[lastCol + 2] = d[rowStart + 2]; d[lastCol + 3] = d[rowStart + 3];
    }
    for (let x = 0; x < size; x++) {
      const top = x * 4;
      const bottom = ((size - 1) * size + x) * 4;
      d[bottom] = d[top]; d[bottom + 1] = d[top + 1];
      d[bottom + 2] = d[top + 2]; d[bottom + 3] = d[top + 3];
    }
    ctx.putImageData(img, 0, 0);
  }

  // ===========================================================================
  // Chalk stroke — rough hand-drawn white chalk line (used for wall silhouettes)
  // ===========================================================================
  function chalkLine(ctx, st, x0, y0, x1, y1, w) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighten';
    // Dustier and lower-contrast than a first pass: real chalk on a dark
    // wall is a soft, thin smudge, not thick white paint.
    ctx.strokeStyle = 'rgba(210,205,192,0.6)';
    ctx.lineCap = 'round';
    const passes = 3;
    for (let p = 0; p < passes; p++) {
      ctx.lineWidth = (w || 3) * (0.5 + p * 0.2);
      ctx.globalAlpha = 0.20 - p * 0.05;
      ctx.beginPath();
      const jx = st.sym(1.2), jy = st.sym(1.2);
      ctx.moveTo(x0 + jx, y0 + jy);
      ctx.lineTo(x1 + st.sym(1.2), y1 + st.sym(1.2));
      ctx.stroke();
    }
    ctx.restore();
  }
  function chalkPoly(ctx, st, pts, w) {
    for (let i = 0; i < pts.length - 1; i++) chalkLine(ctx, st, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w);
  }
  // Rough hand-chalked CLOSED silhouette: `pts` is an array of [x,y] in units
  // of `s` around (cx,cy), traced clockwise. Outlines every edge with the
  // same multi-pass wobble as chalkLine (one shared visual language for all
  // chalk marks), jittering per-VERTEX (not per-segment) so adjoining edges
  // still meet, then scribbles light interior hatching so the shape reads as
  // a solid tracing at a glance instead of a thin wireframe nobody can parse
  // from across a room.
  function chalkSilhouette(ctx, st, pts, cx, cy, s, opts) {
    opts = opts || {};
    const n = pts.length;
    const P = pts.map((p) => [cx + p[0] * s + st.sym(s * 0.012), cy + p[1] * s + st.sym(s * 0.012)]);
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      chalkLine(ctx, st, a[0], a[1], b[0], b[1], opts.w || s * 0.045);
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(P[i][0], P[i][1]);
    ctx.closePath();
    ctx.clip();
    ctx.globalCompositeOperation = 'lighten';
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of P) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const hatches = Math.max(4, Math.round((maxX - minX) / (s * 0.14)));
    ctx.strokeStyle = 'rgba(200,196,185,0.09)';
    ctx.lineWidth = s * 0.025;
    for (let i = 0; i < hatches; i++) {
      const t = (i + 0.5) / hatches;
      const x = minX + t * (maxX - minX) + st.sym(s * 0.02);
      ctx.beginPath();
      ctx.moveTo(x, minY - s * 0.1);
      ctx.lineTo(x + st.sym(s * 0.05), maxY + s * 0.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ===========================================================================
  // Material builders
  // ===========================================================================
  const stopsWood = [[0, [14, 10, 7]], [0.3, [40, 30, 20]], [0.6, [78, 60, 40]], [0.85, [115, 90, 60]], [1, [140, 112, 78]]];
  const stopsWoodDark = [[0, [10, 7, 5]], [0.35, [28, 20, 13]], [0.7, [50, 38, 25]], [1, [70, 54, 36]]];
  const stopsWoodNew = [[0, [30, 22, 14]], [0.4, [78, 60, 40]], [0.75, [130, 104, 72]], [1, [168, 138, 98]]];
  const stopsPlaster = [[0, [26, 20, 15]], [0.30, [64, 52, 40]], [0.55, [104, 86, 66]], [0.78, [148, 126, 98]], [1, [196, 172, 138]]];
  const stopsBrick = [[0, [18, 12, 10]], [0.3, [58, 28, 20]], [0.6, [104, 52, 36]], [0.85, [130, 68, 46]], [1, [148, 84, 56]]];
  const stopsConcrete = [[0, [17, 16, 15]], [0.4, [62, 58, 54]], [0.7, [100, 94, 86]], [1, [146, 138, 126]]];
  const stopsDirt = [[0, [10, 8, 6]], [0.3, [28, 22, 15]], [0.6, [52, 40, 26]], [0.85, [74, 58, 38]], [1, [96, 78, 52]]];
  const stopsRust = [[0, [12, 10, 9]], [0.3, [40, 24, 14]], [0.55, [96, 52, 20]], [0.8, [140, 78, 30]], [1, [172, 104, 42]]];
  const stopsMetal = [[0, [9, 8, 8]], [0.5, [30, 28, 27]], [0.8, [55, 52, 49]], [1, [82, 78, 73]]];

  function tileWood(seedN, size, opts) {
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, Math.round(size / 8), seedN, {
      octaves: 4, freq: opts.freq || 3, warpAmt: 0.4, warpFreq: 3, gain: 0.55, lac: 2.2,
      stretchU: opts.axis === 'u' ? 1 : 6, stretchV: opts.axis === 'u' ? 6 : 1,
      stops: opts.stops || stopsWood,
    });
    ctx.drawImage(base, 0, 0);
    boards(ctx, size, seedN, opts);
    if (opts.stainAmt) stains(ctx, size, seedN, { count: opts.stainCount || 3, color: [12, 11, 10], alpha: opts.stainAmt });
    scratches(ctx, size, seedN, opts.scratchCount === undefined ? 10 : opts.scratchCount, { maxLen: 0.15 });
    edgeWear(ctx, size, seedN, {
      count: opts.wearCount === undefined ? 4 : opts.wearCount,
      color: [190, 172, 140],
      amount: opts.wear === undefined ? 1 : opts.wear,
      axis: opts.axis,
      stretch: opts.wearStretch || 1,
    });
    if (opts.ao !== false) dirtAO(ctx, size, { strength: 0.14 });
    grime(ctx, size, seedN, opts.grime === undefined ? 1 : opts.grime);
    forceSeamEdges(c);
    return c;
  }

  function makeWoodFloor() {
    const c = tileWood(1, HERO, {
      axis: 'u', count: 8, freq: 2.4, stops: stopsWood, knots: true, rot: true, nails: true,
      gapColor: 'rgba(4,3,3,0.92)', gapWidth: 2.2, stainAmt: 0.22, stainCount: 4, scratchCount: 16,
      // The old wear pass was 4 round screen-blend glows dropped anywhere on
      // the tile -- against a bright base wood at amount 1.3 that IS the
      // "spilled paper / snow" blotch the brief called out. Stretched hard
      // along the board axis and toned way down, the same primitive reads
      // as a walked-in sheen running WITH the grain instead of floating on
      // top of it.
      wear: 0.55, wearStretch: 4, wearCount: 5,
      newness: 0.80, grime: 1,
    });
    return { canvas: c, size: HERO, tile: [true, true], spec: 0.06, gloss: 0.18, emissive: 0, normal: sobelNormal(c, HERO / 2), tint: [1, 1, 1] };
  }
  function makeWoodWall() {
    const c = tileWood(2, HERO, {
      axis: 'v', count: 10, freq: 2.2, stops: stopsWoodDark, knots: true, rot: true, nails: true,
      gapColor: 'rgba(2,2,2,0.95)', gapWidth: 3, stainAmt: 0.3, stainCount: 3, scratchCount: 8, wear: 0.6, grime: 1.15,
    });
    // battens: a slightly raised/lighter narrow board every other gap (board-and-batten motif)
    const ctx = ctx2d(c);
    const st = rng(2 + 3000);
    const count = 10, cross = HERO / count;
    for (let i = 1; i < count; i += 2) {
      const x = i * cross;
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(10,8,6,0.35)';
      ctx.fillRect(x - cross * 0.06, 0, cross * 0.12, HERO);
      ctx.restore();
    }
    forceSeamEdges(c);
    return { canvas: c, size: HERO, tile: [true, true], spec: 0.05, gloss: 0.14, emissive: 0, normal: sobelNormal(c, HERO / 2), tint: [1, 1, 1] };
  }
  function makeWoodPlank() {
    const size = PROP;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, 40, 3, { octaves: 4, freq: 2, warpAmt: 0.3, warpFreq: 2, stretchU: 1, stretchV: 8, stops: stopsWoodNew });
    ctx.drawImage(base, 0, 0);
    const st = rng(3 + 1000);
    // rough-sawn splintered short ends: jagged alpha mask via clip path
    ctx.save();
    ctx.beginPath();
    const jag = 8;
    ctx.moveTo(0, 0);
    for (let i = 0; i <= jag; i++) { const t = i / jag; ctx.lineTo(size * 0.02 * (RNG.hash2(i, 40) - 0.5) * 2 + t * size * (i === 0 ? 0 : 0), t * size); }
    ctx.restore();
    // simpler: draw jagged dark notches biting into the two long ends (top/bottom = board ends here, board runs along V)
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(0, 6);
    for (let x = 0; x <= size; x += size / 10) ctx.lineTo(x, 6 + (RNG.hash2(x | 0, 11) - 0.5) * 10);
    ctx.lineTo(size, size - 6);
    for (let x = size; x >= 0; x -= size / 10) ctx.lineTo(x, size - 6 + (RNG.hash2(x | 0, 12) - 0.5) * 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const streaks = 10;
    for (let s = 0; s < streaks; s++) {
      const t = RNG.hash2(s, 77);
      ctx.fillStyle = `rgba(30,22,14,${(0.08 + t * 0.1).toFixed(3)})`;
      const x = (s + 0.5) * (size / streaks) + (t - 0.5) * 6;
      ctx.fillRect(x - 0.7, 0, 1.4, size);
    }
    ctx.restore();
    scratches(ctx, size, 3, 6, { maxLen: 0.4 });
    grime(ctx, size, 3, 0.5);
    return { canvas: c, size, tile: [false, false], spec: 0.06, gloss: 0.2, emissive: 0, normal: null, tint: [1, 1, 1] };
  }
  function makeWoodStair() {
    const c = tileWood(4, PROP, {
      axis: 'u', count: 3, freq: 1.6, stops: stopsWoodDark, knots: true, rot: false, nails: false,
      gapColor: 'rgba(4,3,3,0.9)', gapWidth: 2, stainAmt: 0.2, stainCount: 2, scratchCount: 14, wear: 1.6, grime: 1,
    });
    return { canvas: c, size: PROP, tile: [true, true], spec: 0.06, gloss: 0.16, emissive: 0, normal: null, tint: [1, 1, 1] };
  }
  function makeCeilingWood() {
    const c = mkCanvas(HERO);
    const ctx = ctx2d(c);
    const base = baseLayer(HERO, 56, 7, { octaves: 4, freq: 2.4, warpAmt: 0.35, warpFreq: 3, stretchU: 6, stretchV: 1, stops: stopsWoodDark });
    ctx.drawImage(base, 0, 0);
    // exposed joists: wide dark beams every ~1/4, boards between running perpendicular
    const st = rng(7 + 1000);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 4; i++) {
      const y = (i + 0.5) * (HERO / 4);
      ctx.fillStyle = 'rgba(6,5,4,0.55)';
      ctx.fillRect(0, y - HERO * 0.035, HERO, HERO * 0.07);
    }
    ctx.restore();
    boards(ctx, HERO, 7, { axis: 'u', count: 14, stops: stopsWoodDark, gapColor: 'rgba(2,2,2,0.9)', gapWidth: 1.6, wobble: 1, nails: false, knots: true, rot: true });
    stains(ctx, HERO, 7, { count: 4, color: [8, 7, 8], alpha: 0.3 });
    grime(ctx, HERO, 7, 1.3);
    dirtAO(ctx, HERO, { strength: 0.22 });
    forceSeamEdges(c);
    return { canvas: c, size: HERO, tile: [true, true], spec: 0.04, gloss: 0.1, emissive: 0, normal: null, tint: [0.85, 0.85, 0.9] };
  }
  function makeWindowFrame() {
    const size = PROP;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, 40, 14, { octaves: 3, freq: 3, warpAmt: 0.3, warpFreq: 2, stretchV: 5, stops: [[0, [16, 15, 14]], [0.5, [70, 66, 58]], [1, [120, 112, 96]]] });
    ctx.drawImage(base, 0, 0);
    // peeling paint: irregular flat mint/white patches masked by noise, eroded at edges
    const st = rng(14 + 1000);
    const patches = voronoiField(48, 14, 22);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * patches.res, fy = (y / size) * patches.res;
        const idx = (fy | 0) * patches.res + (fx | 0);
        const keep = RNG.hash2(patches.cellId[idx] * 13 + 5, 14) > 0.42; // ~58% of patches keep paint
        if (keep) {
          const i = (y * size + x) * 4;
          const paintTone = 150 + RNG.hash2(x >> 3, y >> 3) * 40;
          const edgeSoft = patches.edge[idx];
          const mix = M.clamp01(1 - edgeSoft * 0.9);
          d[i] = M.lerp(d[i], paintTone * 0.95, mix);
          d[i + 1] = M.lerp(d[i + 1], paintTone, mix);
          d[i + 2] = M.lerp(d[i + 2], paintTone * 0.9, mix);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    stains(ctx, size, 14, { count: 3, color: [10, 9, 9], alpha: 0.3 });
    scratches(ctx, size, 14, 8, { maxLen: 0.2 });
    grime(ctx, size, 14, 1.1);
    return { canvas: c, size, tile: [false, false], spec: 0.1, gloss: 0.25, emissive: 0, normal: null, tint: [0.52, 0.50, 0.46] };
  }

  function makePlasterWall() {
    const size = HERO, seedN = 3;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);

    // Base coat. The old version sampled fbm at 64x64 for an 8x upscale to
    // 512 -- with nothing else in the function providing a hard edge, that
    // upscale blur WAS the whole texture, which is why it read as smoke
    // instead of plaster. Sampling at 128x128 (a 4x upscale) keeps real
    // texel-scale variation alive; the grain pass right after finishes the
    // job of reading as a troweled surface instead of a soft-focus photo.
    const base = baseLayer(size, 128, seedN + 500, {
      octaves: 5, freq: 6.5, warpAmt: 0.3, warpFreq: 3.2, gain: 0.48, lac: 2.15,
      stops: stopsPlaster,
    });
    ctx.drawImage(base, 0, 0);
    drawGrain(ctx, size, seedN, 0.16, 'multiply');
    drawGrain(ctx, size, seedN + 1, 0.10, 'overlay');

    // Exposed lath: real horizontal wood strips behind a broken-edged
    // plaster-loss patch, not a colour-swapped pixel blend. Kept off the
    // tile border so forceSeamEdges below never has to cut through one.
    const stL = rng(seedN + 4400);
    for (let n = 0; n < 4; n++) {
      const pw = size * stL.range(0.10, 0.20), ph = size * stL.range(0.08, 0.15);
      const px = pw * 1.2 + stL.f() * (size - pw * 2.4);
      const py = ph * 1.2 + stL.f() * (size - ph * 2.4);
      const path = jaggedRectPath(px, py, pw, ph, stL, 10);
      ctx.save();
      ctx.clip(path);
      ctx.fillStyle = 'rgba(18,14,11,0.55)';
      ctx.fillRect(px - pw, py - ph, pw * 2, ph * 2);
      const laths = 6, lh = (ph * 2) / laths;
      for (let l = 0; l < laths; l++) {
        const ly = py - ph + l * lh;
        const rgb = ramp(0.2 + RNG.hash2(n * 13 + l, seedN) * 0.5, stopsWoodDark);
        ctx.fillStyle = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},0.92)`;
        ctx.fillRect(px - pw, ly + lh * 0.12, pw * 2, lh * 0.72);
      }
      ctx.strokeStyle = 'rgba(8,6,5,0.55)';
      ctx.lineWidth = 1.3;
      for (let sp = 1; sp < 3; sp++) {
        const gx = px - pw + sp * (pw * 2 / 3);
        ctx.beginPath(); ctx.moveTo(gx, py - ph); ctx.lineTo(gx + stL.sym(3), py + ph); ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(10,8,7,0.4)';
      ctx.lineWidth = size * 0.01;
      ctx.stroke(path);
      ctx.restore();
    }

    // One larger exposed stud per tile: vertical timber behind the plaster,
    // the "studs" half of "lath and studs". Also kept edge-safe.
    {
      const stS = rng(seedN + 4600);
      const sw = size * stS.range(0.055, 0.08), sh = size * stS.range(0.3, 0.44);
      const sx = sw * 1.2 + stS.f() * (size - sw * 2.4);
      const sy = sh * 1.2 + stS.f() * (size - sh * 2.4);
      const path = jaggedRectPath(sx, sy, sw, sh, stS, 8);
      ctx.save();
      ctx.clip(path);
      ctx.fillStyle = 'rgba(16,12,9,0.5)';
      ctx.fillRect(sx - sw, sy - sh, sw * 2, sh * 2);
      const wc = ramp(0.4, stopsWoodDark);
      ctx.fillStyle = `rgb(${wc[0] | 0},${wc[1] | 0},${wc[2] | 0})`;
      ctx.fillRect(sx - sw * 0.85, sy - sh, sw * 1.7, sh * 2);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      for (let g = 0; g < 6; g++) {
        const gx = sx - sw * 0.7 + g * sw * 0.24 + stS.sym(sw * 0.04);
        ctx.fillStyle = `rgba(20,14,9,${(0.08 + stS.f() * 0.1).toFixed(3)})`;
        ctx.fillRect(gx, sy - sh, sw * 0.05, sh * 2);
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(140,120,95,0.35)';
      for (let nn = 0; nn < 3; nn++) {
        ctx.beginPath(); ctx.arc(sx, sy - sh * 0.6 + nn * sh * 0.6, 2.2, 0, M.TAU); ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(10,8,7,0.45)';
      ctx.lineWidth = size * 0.012;
      ctx.stroke(path);
      ctx.restore();
    }

    // Cracks: more numerous and higher-contrast -- the old network was
    // getting lost entirely against the blurred base.
    crackNetwork(ctx, size, seedN, { count: 9, depth: 5, width: 1.4, maxLen: 0.42, color: 'rgba(12,10,9,0.6)' });

    // Water stains: warm dirty drips, not neutral-grey soot. Dark damp
    // streaks plus a few pale chalky lime-leach streaks, both running down
    // from near the top -- the long-neglected-plaster tell.
    const stW = rng(seedN + 4000);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 6; i++) {
      const x = stW.f() * size, y0 = size * stW.range(0, 0.15), h = size * stW.range(0.25, 0.75);
      const grad = ctx.createLinearGradient(x, y0, x, y0 + h);
      grad.addColorStop(0, 'rgba(28,20,13,0.38)');
      grad.addColorStop(1, 'rgba(28,20,13,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - size * stW.range(0.015, 0.04), y0, size * stW.range(0.03, 0.08), h);
    }
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
      const x = stW.f() * size, y0 = size * stW.range(0, 0.2), h = size * stW.range(0.2, 0.5);
      const grad = ctx.createLinearGradient(x, y0, x, y0 + h);
      grad.addColorStop(0, 'rgba(180,160,120,0.12)');
      grad.addColorStop(1, 'rgba(180,160,120,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - size * 0.012, y0, size * 0.024, h);
    }
    ctx.restore();

    stains(ctx, size, seedN, { count: 4, color: [40, 32, 22], alpha: 0.22 });
    grime(ctx, size, seedN, 1.1);
    // baseboard grime: the bottom edge always collects the worst of it, but
    // unevenly -- a single flat gradient band read as a smear, not a
    // wainscot line or damp stain, so vary the rise per column instead.
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const kickCols = 40;
    for (let i = 0; i < kickCols; i++) {
      const x0 = (i / kickCols) * size, cw = size / kickCols + 1;
      const h = size * (0.07 + RNG.hash2(i, seedN + 4800) * 0.15);
      const grad = ctx.createLinearGradient(0, size, 0, size - h);
      grad.addColorStop(0, 'rgba(10,8,6,0.32)');
      grad.addColorStop(1, 'rgba(10,8,6,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x0, size - h, cw, h);
    }
    ctx.restore();
    dirtAO(ctx, size, { strength: 0.14 });
    forceSeamEdges(c);
    return { canvas: c, size, tile: [true, true], spec: 0.07, gloss: 0.10, emissive: 0, normal: sobelNormal(c, size / 2), tint: [0.92, 0.86, 0.78] };
  }

  function makeBrick() {
    const size = HERO, seedN = 4;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const rows = 12, cols = 6;
    const bh = size / rows, bw = size / cols;
    const st = rng(seedN);
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * bw * 0.5;
      for (let cc = -1; cc <= cols; cc++) {
        const x0 = cc * bw + offset, y0 = r * bh;
        const tone = 0.3 + RNG.hash2(cc + r * 31, seedN) * 0.6;
        const rgb = ramp(tone, stopsBrick);
        ctx.fillStyle = `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
        ctx.fillRect(x0 + 1, y0 + 1, bw - 2, bh - 2);
      }
    }
    // mortar grid drawn on top (thin, irregular, near-white-grey but grimy)
    ctx.save();
    ctx.strokeStyle = 'rgba(90,84,74,0.9)';
    ctx.lineWidth = 2;
    for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * bh); ctx.lineTo(size, r * bh); ctx.stroke(); }
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * bw * 0.5;
      for (let cc = -1; cc <= cols; cc++) {
        const x = cc * bw + offset;
        ctx.beginPath(); ctx.moveTo(x, r * bh); ctx.lineTo(x, (r + 1) * bh); ctx.stroke();
      }
    }
    ctx.restore();
    // per-brick grain via low-res warped noise multiply
    const grain = baseLayer(size, 64, seedN + 300, { octaves: 4, freq: 6, warpAmt: 0.2, warpFreq: 4, stops: [[0, [0, 0, 0]], [0.5, [128, 128, 128]], [1, [255, 255, 255]]] });
    ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.5; ctx.drawImage(grain, 0, 0); ctx.restore();
    // crumbling mortar chips + soot blackening (heavier near "top", i.e. near a fireplace/blast)
    crackNetwork(ctx, size, seedN, { count: 4, depth: 3, width: 1, maxLen: 0.15, color: 'rgba(70,64,56,0.4)' });
    stains(ctx, size, seedN, { count: 3, color: [10, 9, 9], alpha: 0.35 });
    grime(ctx, size, seedN, 1.2);
    dirtAO(ctx, size, { strength: 0.15 });
    forceSeamEdges(c);
    return { canvas: c, size, tile: [true, true], spec: 0.07, gloss: 0.14, emissive: 0, normal: sobelNormal(c, size / 2), tint: [1, 1, 1] };
  }

  function makeConcrete() {
    const size = HERO, seedN = 5;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, 56, seedN, { octaves: 4, freq: 6.5, warpAmt: 0.22, warpFreq: 3, stops: stopsConcrete });
    ctx.drawImage(base, 0, 0);
    // aggregate speckle via voronoi cell tone variance
    const voro = voronoiField(72, seedN, 90);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * voro.res, fy = (y / size) * voro.res;
        const idx = (fy | 0) * voro.res + (fx | 0);
        const speck = (RNG.hash2(voro.cellId[idx] * 3 + 1, seedN) - 0.5) * 30;
        const i = (y * size + x) * 4;
        d[i] = M.clamp(d[i] + speck, 0, 255); d[i + 1] = M.clamp(d[i + 1] + speck, 0, 255); d[i + 2] = M.clamp(d[i + 2] + speck * 0.9, 0, 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    crackNetwork(ctx, size, seedN, { count: 5, depth: 4, width: 1.2, maxLen: 0.35, color: 'rgba(10,10,11,0.55)' });
    // chip divots: small dark crescents with a bright highlight edge
    const st = rng(seedN + 1000);
    for (let i = 0; i < 14; i++) {
      const x = st.f() * size, y = st.f() * size, r = st.range(2, 6);
      dab(ctx, x, y, r, (al) => `rgba(6,6,7,${(al * 0.5).toFixed(3)})`, 'multiply');
      dab(ctx, x - r * 0.3, y - r * 0.3, r * 0.6, (al) => `rgba(180,180,180,${(al * 0.18).toFixed(3)})`, 'screen');
    }
    stains(ctx, size, seedN, { count: 3, color: [12, 12, 13], alpha: 0.2 });
    grime(ctx, size, seedN, 0.9);
    dirtAO(ctx, size, { strength: 0.1 });
    forceSeamEdges(c);
    return { canvas: c, size, tile: [true, true], spec: 0.1, gloss: 0.2, emissive: 0, normal: sobelNormal(c, size / 2), tint: [1, 1, 1] };
  }

  function makeDirtGround() {
    const size = HERO, seedN = 6;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, 56, seedN, { octaves: 5, freq: 3, warpAmt: 0.55, warpFreq: 3, gain: 0.55, stops: stopsDirt });
    ctx.drawImage(base, 0, 0);
    // gravel speckle
    const voro = voronoiField(80, seedN, 140);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * voro.res, fy = (y / size) * voro.res;
        const idx = (fy | 0) * voro.res + (fx | 0);
        if (voro.edge[idx] > 0.55 && RNG.hash2(voro.cellId[idx] * 5, seedN) > 0.6) {
          const i = (y * size + x) * 4;
          const g = 60 + RNG.hash2(x, y) * 50;
          d[i] = g; d[i + 1] = g * 0.92; d[i + 2] = g * 0.8;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    // puddle dark patches
    stains(ctx, size, seedN, { count: 5, color: [4, 6, 8], alpha: 0.5, minR: 0.05, maxR: 0.16 });
    // scattered debris flecks (splinters, brass, brick bits)
    const st = rng(seedN + 1000);
    for (let i = 0; i < 40; i++) {
      const x = st.f() * size, y = st.f() * size;
      const c2 = st.pick([[40, 30, 20], [90, 88, 80], [70, 40, 25]]);
      ctx.fillStyle = `rgba(${c2[0]},${c2[1]},${c2[2]},0.6)`;
      ctx.save(); ctx.translate(x, y); ctx.rotate(st.f() * M.TAU);
      ctx.fillRect(-st.range(1, 3), -st.range(0.5, 1.5), st.range(2, 6), st.range(1, 3));
      ctx.restore();
    }
    grime(ctx, size, seedN, 1);
    forceSeamEdges(c);
    return { canvas: c, size, tile: [true, true], spec: 0.02, gloss: 0.05, emissive: 0, normal: null, tint: [1, 1, 1] };
  }

  function makeRubble() {
    const size = HERO, seedN = 10;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, 56, seedN, { octaves: 5, freq: 2.6, warpAmt: 0.5, warpFreq: 2.5, stops: stopsDirt });
    ctx.drawImage(base, 0, 0);
    const voro = voronoiField(48, seedN, 60);
    const st = rng(seedN + 500);
    for (let i = 0; i < voro.pts.length; i++) {
      const px = (voro.pts[i][0] / voro.res) * size, py = (voro.pts[i][1] / voro.res) * size;
      const type = RNG.hash2(i, seedN);
      const r = size * (0.02 + voro.pts[i][2] * 0.05);
      let col;
      if (type < 0.4) col = stopsBrick[2][1];
      else if (type < 0.75) col = stopsConcrete[2][1];
      else col = stopsWood[1][1];
      ctx.save();
      ctx.translate(px, py); ctx.rotate(RNG.hash2(i * 7, seedN) * M.TAU);
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.85)`;
      ctx.fillRect(-r, -r * 0.6, r * 2, r * 1.2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-r, r * 0.4, r * 2, r * 0.3);
      ctx.restore();
    }
    stains(ctx, size, seedN, { count: 4, color: [8, 8, 9], alpha: 0.3 });
    grime(ctx, size, seedN, 1.2);
    dirtAO(ctx, size, { strength: 0.12 });
    forceSeamEdges(c);
    return { canvas: c, size, tile: [true, true], spec: 0.03, gloss: 0.06, emissive: 0, normal: null, tint: [1, 1, 1] };
  }

  function makeMetalRusty() {
    const size = HERO, seedN = 8;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    // corrugation: vertical ridges via a sine-based normal-ish shading baked into albedo
    const ridges = 16;
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const phase = (x / size) * ridges * M.TAU;
        const shade = Math.sin(phase) * 0.5 + 0.5; // 0..1 across ridge
        const rgb = ramp(shade * 0.4 + 0.15, stopsMetal);
        const i = (y * size + x) * 4;
        d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // rust bloom via low-res warped fbm, heavier at bottom (gravity streaking)
    const rust = baseLayer(size, 56, seedN, { octaves: 5, freq: 2.5, warpAmt: 0.5, warpFreq: 2.5, stretchV: 2.2, stops: [[0, [0, 0, 0, 0]], [1, [1, 1, 1]]].map((s) => [s[0], s[1]]) });
    // build a proper alpha rust mask manually instead (reuse baseLayer's grayscale via luminance)
    const rimg = ctx2d(rust).getImageData(0, 0, size, size);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const rustC = mkCanvas(size); const rctx = ctx2d(rustC);
    const rOut = rctx.createImageData(size, size);
    for (let p = 0; p < rOut.data.length; p += 4) {
      const t = rimg.data[p] / 255;
      const streakBoost = 0.15; // subtle extra weighting handled by warp already
      const rgb = ramp(M.clamp01(t), stopsRust);
      rOut.data[p] = rgb[0]; rOut.data[p + 1] = rgb[1]; rOut.data[p + 2] = rgb[2];
      rOut.data[p + 3] = M.clamp01((t - 0.12) * 2.4) * 235;
    }
    rctx.putImageData(rOut, 0, 0);
    ctx.globalAlpha = 1; ctx.drawImage(rustC, 0, 0);
    ctx.restore();
    // rivets
    const st = rng(seedN + 1000);
    ctx.save();
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 10; i++) {
        const x = (i + 0.5) * (size / 10), y = size * (0.12 + row * 0.76);
        ctx.fillStyle = 'rgba(20,18,16,0.7)';
        ctx.beginPath(); ctx.arc(x, y, 3, 0, M.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(140,120,100,0.5)';
        ctx.beginPath(); ctx.arc(x - 0.8, y - 0.8, 1.1, 0, M.TAU); ctx.fill();
      }
    }
    ctx.restore();
    scratches(ctx, size, seedN, 16, { maxLen: 0.25 });
    grime(ctx, size, seedN, 1);
    forceSeamEdges(c);
    return { canvas: c, size, tile: [true, true], spec: 0.35, gloss: 0.4, emissive: 0, normal: sobelNormal(c, size / 2), tint: [1, 1, 1] };
  }

  function makeRoofShingle() {
    const size = HERO, seedN = 9;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, 56, seedN, { octaves: 4, freq: 2.5, warpAmt: 0.3, warpFreq: 2, stops: stopsWoodDark });
    ctx.drawImage(base, 0, 0);
    const rows = 8, cols = 8;
    const rh = size / rows, rw = size / cols;
    ctx.save();
    ctx.strokeStyle = 'rgba(5,5,5,0.6)';
    ctx.lineWidth = 1.5;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * rw * 0.5;
      for (let cc = -1; cc <= cols; cc++) {
        const x = cc * rw + offset;
        ctx.beginPath();
        ctx.moveTo(x, r * rh); ctx.lineTo(x + rw * 0.5, r * rh + rh * 0.5); ctx.lineTo(x, (r + 1) * rh);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, (r + 1) * rh); ctx.lineTo(size, (r + 1) * rh); ctx.stroke();
    }
    ctx.restore();
    stains(ctx, size, seedN, { count: 3, color: [8, 8, 9], alpha: 0.3 });
    grime(ctx, size, seedN, 1.1);
    dirtAO(ctx, size, { strength: 0.14 });
    forceSeamEdges(c);
    return { canvas: c, size, tile: [true, true], spec: 0.06, gloss: 0.12, emissive: 0, normal: null, tint: [1, 1, 1] };
  }

  function makeSandbag() {
    const size = PROP, seedN = 13;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, 44, seedN, { octaves: 4, freq: 3, warpAmt: 0.4, warpFreq: 3, stops: [[0, [20, 17, 12]], [0.5, [64, 54, 38]], [1, [100, 86, 62]]] });
    ctx.drawImage(base, 0, 0);
    // hessian weave: crosshatched fine lines
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = 'rgba(20,16,12,0.25)';
    ctx.lineWidth = 1;
    const step = 5;
    for (let i = -size; i < size * 2; i += step) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, size); ctx.lineTo(i + size, 0); ctx.stroke();
    }
    ctx.restore();
    // bag-fold shading bands
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 4; i++) {
      const y = (i + 0.5) * (size / 4);
      const grad = ctx.createLinearGradient(0, y - size * 0.08, 0, y + size * 0.08);
      grad.addColorStop(0, 'rgba(10,9,7,0)'); grad.addColorStop(0.5, 'rgba(10,9,7,0.4)'); grad.addColorStop(1, 'rgba(10,9,7,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, y - size * 0.08, size, size * 0.16);
    }
    ctx.restore();
    stains(ctx, size, seedN, { count: 3, color: [12, 10, 8], alpha: 0.3 });
    grime(ctx, size, seedN, 1);
    forceSeamEdges(c);
    return { canvas: c, size, tile: [true, true], spec: 0.02, gloss: 0.04, emissive: 0, normal: null, tint: [1, 1, 1] };
  }

  function makeBloodWall() {
    const size = PROP, seedN = 15;
    const c = mkCanvas(size);
    const ctx = ctx2d(c); // transparent bg — this is an overlay decal
    const st = rng(seedN);
    const bloodDark = [58, 8, 8], bloodWet = [110, 14, 12];
    // handprint
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = `rgba(${bloodDark[0]},${bloodDark[1]},${bloodDark[2]},0.8)`;
    const hx = size * 0.6, hy = size * 0.4;
    ctx.translate(hx, hy); ctx.rotate(0.3);
    ctx.beginPath(); ctx.ellipse(0, 0, size * 0.09, size * 0.14, 0, 0, M.TAU); ctx.fill();
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i - 2) * 0.22);
      ctx.beginPath(); ctx.ellipse(0, -size * 0.16, size * 0.022, size * 0.07, 0, 0, M.TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // spatter: many small elongated drips radiating from a couple of impact points
    for (let cluster = 0; cluster < 2; cluster++) {
      const cx = st.f() * size, cy = st.f() * size;
      const n = 30;
      for (let i = 0; i < n; i++) {
        const ang = st.f() * M.TAU, dist = st.range(0, size * 0.35) * (1 - i / n * 0.3);
        const x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist;
        const r = st.range(1, 5) * (1 - dist / (size * 0.4));
        if (r <= 0.3) continue;
        ctx.fillStyle = `rgba(${bloodWet[0]},${bloodWet[1]},${bloodWet[2]},${st.range(0.5, 0.9).toFixed(2)})`;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * st.range(1, 2.2), ang, 0, M.TAU); ctx.fill();
        // drip tail
        if (st.bool(0.4)) {
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = r * 0.5;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(Math.PI / 2 + ang * 0.1) * r * 3, y + st.range(4, 14)); ctx.stroke();
        }
      }
    }
    grime(ctx, size, seedN, 0.3);
    return { canvas: c, size, tile: [false, false], spec: 0.4, gloss: 0.55, emissive: 0, normal: null, tint: [0.55, 0.50, 0.48], alphaTest: 0.04 };
  }

  function makeCrateWood() {
    const size = PROP, seedN = 16;
    const c = tileWood(seedN, size, { axis: 'v', count: 4, freq: 1.4, stops: stopsWoodNew, knots: true, rot: false, nails: true, gapColor: 'rgba(4,3,3,0.9)', gapWidth: 2.5, stainAmt: 0.1, scratchCount: 6, wear: 0.7, grime: 0.7, ao: false });
    const ctx = ctx2d(c);
    // iron corner bracing
    ctx.save();
    ctx.fillStyle = 'rgba(30,28,26,0.85)';
    const bw = size * 0.06;
    ctx.fillRect(0, 0, size, bw); ctx.fillRect(0, size - bw, size, bw);
    ctx.fillStyle = 'rgba(70,64,56,0.4)';
    ctx.fillRect(0, bw * 0.15, size, bw * 0.2); ctx.fillRect(0, size - bw + bw * 0.15, size, bw * 0.2);
    ctx.restore();
    // stencilled German lettering, then eroded
    ctx.save();
    ctx.font = `bold ${Math.round(size * 0.14)}px monospace`;
    ctx.fillStyle = 'rgba(210,205,190,0.85)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(size / 2, size / 2);
    ctx.fillText('MUNITION', 0, -size * 0.02);
    ctx.font = `${Math.round(size * 0.09)}px monospace`;
    ctx.fillText('7.92mm', 0, size * 0.16);
    ctx.restore();
    // erode the stencil with noise mask (partial paint loss)
    const mask = baseLayer(size, 48, seedN + 700, { octaves: 4, freq: 5, stops: [[0, [0, 0, 0]], [1, [255, 255, 255]]] });
    const mctx = ctx2d(mask);
    const mdata = mctx.getImageData(0, 0, size, size).data;
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let p = 0; p < d.length; p += 4) {
      if (mdata[p] < 110) { d[p + 3] = d[p + 3] * 0.15; }
    }
    ctx.putImageData(img, 0, 0);
    grime(ctx, size, seedN, 0.6);
    return { canvas: c, size, tile: [false, false], spec: 0.08, gloss: 0.16, emissive: 0, normal: null, tint: [1, 1, 1] };
  }

  function makeBarrelMetal() {
    const size = PROP, seedN = 17;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, 48, seedN, { octaves: 4, freq: 2.5, warpAmt: 0.35, warpFreq: 2.5, stops: stopsMetal });
    ctx.drawImage(base, 0, 0);
    // horizontal bands (rolling hoops)
    ctx.save();
    for (const t of [0.12, 0.5, 0.88]) {
      ctx.fillStyle = 'rgba(15,13,12,0.5)';
      ctx.fillRect(0, size * t - size * 0.02, size, size * 0.04);
      ctx.fillStyle = 'rgba(120,110,95,0.25)';
      ctx.fillRect(0, size * t - size * 0.02, size, size * 0.008);
    }
    ctx.restore();
    const rust = baseLayer(size, 48, seedN + 400, { octaves: 5, freq: 3, warpAmt: 0.5, warpFreq: 3, stretchV: 1.6, stops: [[0, [0, 0, 0]], [1, [255, 255, 255]]] });
    const rd = ctx2d(rust).getImageData(0, 0, size, size).data;
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let p = 0; p < d.length; p += 4) {
      const t = rd[p] / 255;
      if (t > 0.55) {
        const rgb = ramp(t, stopsRust);
        const a = M.clamp01((t - 0.22) * 2.6);
        d[p] = M.lerp(d[p], rgb[0], a); d[p + 1] = M.lerp(d[p + 1], rgb[1], a); d[p + 2] = M.lerp(d[p + 2], rgb[2], a);
      }
    }
    ctx.putImageData(img, 0, 0);
    scratches(ctx, size, seedN, 14, { maxLen: 0.3 });
    grime(ctx, size, seedN, 0.9);
    forceSeamEdges(c);
    return { canvas: c, size, tile: [true, false], spec: 0.3, gloss: 0.35, emissive: 0, normal: null, tint: [1, 1, 1] };
  }

  function makeSignHelp() {
    const size = PROP, seedN = 18;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, 56, seedN, { octaves: 5, freq: 3.5, warpAmt: 0.5, warpFreq: 2.5, stops: stopsPlaster });
    ctx.drawImage(base, 0, 0);
    crackNetwork(ctx, size, seedN, { count: 3, depth: 3, width: 1, maxLen: 0.25, color: 'rgba(14,13,13,0.4)' });
    stains(ctx, size, seedN, { count: 3, color: [24, 25, 27], alpha: 0.2 });
    // HELP written in dripping blood by a shaky/dying hand
    const st = rng(seedN + 200);
    const letters = 'HELP';
    const cx = size * 0.5, cy = size * 0.46, lw = size * 0.19;
    ctx.save();
    ctx.strokeStyle = 'rgba(70,10,10,0.88)';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let li = 0; li < letters.length; li++) {
      const x0 = size * 0.12 + li * lw;
      const strokes = strokesForLetter(letters[li], x0, cy, lw * 0.72, size * 0.32);
      for (const s of strokes) {
        ctx.beginPath();
        ctx.lineWidth = size * st.range(0.018, 0.03);
        for (let k = 0; k < s.length; k++) {
          const jx = s[k][0] + st.sym(size * 0.012);
          const jy = s[k][1] + st.sym(size * 0.012);
          if (k === 0) ctx.moveTo(jx, jy); else ctx.lineTo(jx, jy);
        }
        ctx.stroke();
        // drip from a random point along the stroke
        if (st.bool(0.55)) {
          const p = s[s.length - 1];
          ctx.beginPath();
          ctx.lineWidth = size * st.range(0.008, 0.016);
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(p[0] + st.sym(size * 0.01), p[1] + st.range(size * 0.03, size * 0.09));
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    grime(ctx, size, seedN, 0.9);
    dirtAO(ctx, size, { strength: 0.1 });
    return { canvas: c, size, tile: [false, false], spec: 0.06, gloss: 0.12, emissive: 0, normal: null, tint: [0.42, 0.40, 0.37] };
  }
  // Crude blocky letter stroke paths for HELP (H,E,L,P), origin top-left of cell.
  function strokesForLetter(ch, x0, y0, w, h) {
    const x1 = x0 + w, ytop = y0 - h / 2, ybot = y0 + h / 2, ymid = y0;
    switch (ch) {
      case 'H': return [[[x0, ytop], [x0, ybot]], [[x1, ytop], [x1, ybot]], [[x0, ymid], [x1, ymid]]];
      case 'E': return [[[x0, ytop], [x0, ybot]], [[x0, ytop], [x1, ytop]], [[x0, ymid], [x1 * 0.9, ymid]], [[x0, ybot], [x1, ybot]]];
      case 'L': return [[[x0, ytop], [x0, ybot]], [[x0, ybot], [x1, ybot]]];
      case 'P': return [[[x0, ybot], [x0, ytop]], [[x0, ytop], [x1, ytop + h * 0.12]], [[x1, ytop + h * 0.12], [x0 + w * 0.15, ymid]]];
      default: return [];
    }
  }

  function makePosterFaded() {
    const size = PROP, seedN = 19;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    // torn rectangular paper with alpha edge
    const margin = size * 0.06;
    ctx.save();
    ctx.beginPath();
    const pts = 16;
    ctx.moveTo(margin, margin);
    for (let i = 0; i <= pts; i++) {
      const t = i / pts;
      ctx.lineTo(margin + t * (size - margin * 2), margin + (RNG.hash2(i, seedN) - 0.5) * 8);
    }
    for (let i = 0; i <= pts; i++) {
      const t = i / pts;
      ctx.lineTo(size - margin + (RNG.hash2(i, seedN + 5) - 0.5) * 8, margin + t * (size - margin * 2));
    }
    for (let i = 0; i <= pts; i++) {
      const t = i / pts;
      ctx.lineTo(size - margin - t * (size - margin * 2), size - margin + (RNG.hash2(i, seedN + 9) - 0.5) * 8);
    }
    for (let i = 0; i <= pts; i++) {
      const t = i / pts;
      ctx.lineTo(margin + (RNG.hash2(i, seedN + 13) - 0.5) * 8, size - margin - t * (size - margin * 2));
    }
    ctx.closePath();
    ctx.clip();
    const base = baseLayer(size, 48, seedN, { octaves: 4, freq: 3, warpAmt: 0.4, warpFreq: 2.5, stops: [[0, [40, 36, 26]], [0.5, [110, 100, 78]], [1, [160, 148, 118]]] });
    ctx.drawImage(base, 0, 0);
    // illegible printed content: rows of grey smudge "text" + a faded emblem shape
    const st = rng(seedN + 400);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let r = 0; r < 10; r++) {
      const y = size * 0.15 + r * size * 0.06;
      let x = size * 0.1;
      while (x < size * 0.9) {
        const wlen = st.range(6, 22);
        ctx.fillStyle = `rgba(40,36,30,${st.range(0.1, 0.3).toFixed(2)})`;
        ctx.fillRect(x, y, wlen, size * 0.025);
        x += wlen + st.range(4, 10);
      }
    }
    ctx.beginPath();
    ctx.fillStyle = 'rgba(30,25,20,0.25)';
    ctx.arc(size * 0.5, size * 0.28, size * 0.14, 0, M.TAU);
    ctx.fill();
    ctx.restore();
    ctx.restore();
    crackNetwork(ctx, size, seedN, { count: 2, depth: 2, width: 0.8, maxLen: 0.2, color: 'rgba(20,18,14,0.3)' });
    stains(ctx, size, seedN, { count: 3, color: [20, 18, 14], alpha: 0.3 });
    grime(ctx, size, seedN, 0.8);
    return { canvas: c, size, tile: [false, false], spec: 0.03, gloss: 0.06, emissive: 0, normal: null, tint: [0.44, 0.42, 0.38] };
  }

  // Perk-a-Cola label panels. Each: coloured glass bottle silhouette + cartoon
  // starburst label + machine-panel background, then heavily grimed.
  function makePerkPanel(seedN, hue, name, sub) {
    const size = PROP;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    // dark machine housing base
    const base = baseLayer(size, 40, seedN, { octaves: 4, freq: 3, warpAmt: 0.3, warpFreq: 2, stops: [[0, [8, 8, 10]], [0.5, [22, 20, 24]], [1, [38, 34, 40]]] });
    ctx.drawImage(base, 0, 0);
    // glowing colour panel behind label
    const cx = size * 0.5, cy = size * 0.42, r = size * 0.32;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(${hue[0]},${hue[1]},${hue[2]},0.95)`);
    grad.addColorStop(0.7, `rgba(${hue[0] * 0.6 | 0},${hue[1] * 0.6 | 0},${hue[2] * 0.6 | 0},0.9)`);
    grad.addColorStop(1, 'rgba(10,10,12,0.9)');
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, M.TAU); ctx.fillStyle = grad; ctx.fill();
    ctx.restore();
    // starburst rays
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(255,255,255,0.18)`;
    ctx.lineWidth = size * 0.012;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * M.TAU;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5);
      ctx.lineTo(cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 1.05);
      ctx.stroke();
    }
    ctx.restore();
    // bottle silhouette
    ctx.save();
    ctx.fillStyle = 'rgba(15,15,17,0.85)';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.05, cy + size * 0.16);
    ctx.lineTo(cx - size * 0.06, cy - size * 0.02);
    ctx.lineTo(cx - size * 0.02, cy - size * 0.12);
    ctx.lineTo(cx - size * 0.02, cy - size * 0.2);
    ctx.lineTo(cx + size * 0.02, cy - size * 0.2);
    ctx.lineTo(cx + size * 0.02, cy - size * 0.12);
    ctx.lineTo(cx + size * 0.06, cy - size * 0.02);
    ctx.lineTo(cx + size * 0.05, cy + size * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // label text
    ctx.save();
    ctx.fillStyle = 'rgba(245,240,225,0.92)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(size * 0.09)}px sans-serif`;
    ctx.fillText(name, cx, size * 0.78);
    ctx.font = `${Math.round(size * 0.045)}px sans-serif`;
    ctx.fillText(sub, cx, size * 0.86);
    ctx.restore();
    // frame border (machine bezel)
    ctx.save();
    ctx.strokeStyle = 'rgba(50,46,42,0.9)';
    ctx.lineWidth = size * 0.03;
    ctx.strokeRect(size * 0.03, size * 0.03, size * 0.94, size * 0.94);
    ctx.restore();
    scratches(ctx, size, seedN, 10, { maxLen: 0.2 });
    stains(ctx, size, seedN, { count: 3, color: [8, 8, 9], alpha: 0.35 });
    grime(ctx, size, seedN, 1.4);
    return { canvas: c, size, tile: [false, false], spec: 0.2, gloss: 0.3, emissive: 0.18, normal: null, tint: [1, 1, 1] };
  }

  function makeMysteryBox() {
    const size = PROP, seedN = 24;
    const c = tileWood(seedN, size, { axis: 'u', count: 5, freq: 1.8, stops: stopsWoodDark, knots: true, rot: true, nails: false, gapColor: 'rgba(4,3,3,0.9)', gapWidth: 2, stainAmt: 0.2, scratchCount: 6, wear: 0.5, grime: 1, ao: false });
    const ctx = ctx2d(c);
    // iron banding cross
    ctx.save();
    ctx.fillStyle = 'rgba(24,22,20,0.85)';
    const bw = size * 0.05;
    ctx.fillRect(size * 0.5 - bw / 2, 0, bw, size);
    ctx.fillRect(0, size * 0.5 - bw / 2, size, bw);
    ctx.fillStyle = 'rgba(90,80,68,0.35)';
    ctx.fillRect(size * 0.5 - bw / 2, 0, bw * 0.2, size);
    ctx.restore();
    // pale question marks scattered
    const st = rng(seedN + 300);
    ctx.save();
    ctx.fillStyle = 'rgba(210,200,175,0.55)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 5; i++) {
      const x = st.range(size * 0.15, size * 0.85), y = st.range(size * 0.15, size * 0.85);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(st.sym(0.3));
      ctx.font = `bold ${Math.round(size * st.range(0.1, 0.18))}px serif`;
      ctx.fillText('?', 0, 0);
      ctx.restore();
    }
    ctx.restore();
    grime(ctx, size, seedN, 1.2);
    return { canvas: c, size, tile: [false, false], spec: 0.08, gloss: 0.16, emissive: 0, normal: null, tint: [1, 1, 1] };
  }

  // Chalk wall-buy silhouettes. `draw(ctx,st,cx,cy,s)` draws the gun in a
  // roughly (-s..s) box centred at (cx,cy) using chalkLine/chalkPoly.
  // Closed side-profile silhouettes in units of `s`, +x = toward the muzzle,
  // +y = down. Built as a "bottom edge left-to-right is negative, wraps to a
  // top edge" so the two edges (thin barrel vs. tall stock) never cross --
  // guaranteed simple polygons. Every entry below shares one of these four
  // bodies so rifle / SMG / shotgun / grenade stay a family, the way real
  // wall-buy chalk does, while price/addons still tell the guns apart.
  const RIFLE_LONG = [[1.00, 0.04], [0.15, 0.06], [0.08, 0.14], [-0.02, 0.22], [-0.12, 0.16], [-0.20, 0.18], [-0.55, 0.24], [-0.92, 0.28], [-0.97, 0.28], [-0.97, -0.08], [-0.75, -0.10], [-0.40, -0.08], [-0.20, -0.02], [-0.08, -0.05], [0.15, -0.06], [0.45, -0.055]];
  const RIFLE_SHORT = [[0.78, 0.04], [0.12, 0.06], [0.06, 0.13], [-0.02, 0.19], [-0.10, 0.14], [-0.16, 0.16], [-0.42, 0.20], [-0.72, 0.22], [-0.76, 0.22], [-0.76, -0.07], [-0.55, -0.09], [-0.28, -0.07], [-0.14, -0.02], [-0.05, -0.05], [0.12, -0.06], [0.35, -0.05]];
  const SMG_SIL = [[0.62, 0.05], [0.30, 0.07], [0.15, 0.20], [0.02, 0.34], [-0.10, 0.30], [-0.15, 0.16], [-0.45, 0.20], [-0.68, 0.22], [-0.68, -0.10], [-0.45, -0.09], [-0.15, -0.06], [0.05, -0.09], [0.30, -0.065]];
  const SHOTGUN_SIL = [[0.55, 0.10], [0.10, 0.11], [0.00, 0.20], [-0.10, 0.24], [-0.40, 0.28], [-0.62, 0.26], [-0.62, -0.06], [-0.40, -0.08], [-0.10, -0.05], [0.00, -0.08], [0.10, -0.09]];
  const SAWNOFF_SIL = [[0.32, 0.10], [0.05, 0.11], [-0.02, 0.20], [-0.10, 0.26], [-0.20, 0.22], [-0.20, -0.02], [-0.10, -0.04], [0.00, -0.08], [0.05, -0.09]];

  const CHALK_GUNS = {
    kar98k: { price: 200, draw: (ctx, st, cx, cy, s) => {
      chalkSilhouette(ctx, st, RIFLE_LONG, cx, cy, s);
      chalkLine(ctx, st, cx + s * 0.18, cy - s * 0.10, cx + s * 0.30, cy - s * 0.24, s * 0.035); // bolt handle
    } },
    carbine: { price: 600, draw: (ctx, st, cx, cy, s) => {
      chalkSilhouette(ctx, st, RIFLE_SHORT, cx, cy, s);
      chalkPoly(ctx, st, [[cx + s * 0.04, cy + s * 0.08], [cx - s * 0.02, cy + s * 0.28], [cx - s * 0.09, cy + s * 0.30], [cx - s * 0.07, cy + s * 0.08]], s * 0.035); // box magazine
    } },
    gewehr43: { price: 600, draw: (ctx, st, cx, cy, s) => {
      chalkSilhouette(ctx, st, RIFLE_LONG, cx, cy, s);
      chalkPoly(ctx, st, [[cx + s * 0.02, cy + s * 0.07], [cx - s * 0.03, cy + s * 0.24], [cx - s * 0.11, cy + s * 0.26], [cx - s * 0.08, cy + s * 0.07]], s * 0.035); // box magazine
    } },
    thompson: { price: 1200, draw: (ctx, st, cx, cy, s) => {
      chalkSilhouette(ctx, st, SMG_SIL, cx, cy, s);
      ctx.save(); ctx.globalCompositeOperation = 'lighten'; ctx.strokeStyle = 'rgba(225,222,210,0.6)';
      ctx.beginPath(); ctx.arc(cx - s * 0.02, cy + s * 0.46, s * 0.15, 0, M.TAU); ctx.lineWidth = s * 0.04; ctx.stroke(); ctx.restore(); // drum mag
    } },
    bar: { price: 1800, draw: (ctx, st, cx, cy, s) => {
      chalkSilhouette(ctx, st, RIFLE_LONG, cx, cy, s);
      chalkPoly(ctx, st, [[cx + s * 0.05, cy + s * 0.07], [cx - s * 0.02, cy + s * 0.32], [cx - s * 0.10, cy + s * 0.34], [cx - s * 0.07, cy + s * 0.07]], s * 0.035); // long box magazine
      chalkLine(ctx, st, cx + s * 0.55, cy + s * 0.06, cx + s * 0.42, cy + s * 0.36, s * 0.03); // bipod leg
      chalkLine(ctx, st, cx + s * 0.55, cy + s * 0.06, cx + s * 0.68, cy + s * 0.36, s * 0.03); // bipod leg
    } },
    dbshotgun: { price: 1200, draw: (ctx, st, cx, cy, s) => {
      chalkSilhouette(ctx, st, SHOTGUN_SIL, cx, cy, s);
      chalkLine(ctx, st, cx + s * 0.08, cy - s * 0.14, cx + s * 0.52, cy - s * 0.14, s * 0.025); // second (over/under) barrel
    } },
    // M1897 Trench Gun: single barrel (SHOTGUN_SIL, no second-barrel line),
    // distinguished by a ventilated heat shield sleeved over the front of
    // the barrel, a pump/slide handle hanging below it, and a bayonet lug
    // near the muzzle.
    trenchgun: { price: 1500, draw: (ctx, st, cx, cy, s) => {
      chalkSilhouette(ctx, st, SHOTGUN_SIL, cx, cy, s);
      chalkLine(ctx, st, cx + s * 0.15, cy - s * 0.13, cx + s * 0.48, cy - s * 0.13, s * 0.025); // heat shield top
      chalkLine(ctx, st, cx + s * 0.15, cy + s * 0.12, cx + s * 0.48, cy + s * 0.12, s * 0.025); // heat shield bottom
      chalkLine(ctx, st, cx + s * 0.15, cy - s * 0.13, cx + s * 0.15, cy + s * 0.12, s * 0.025); // heat shield front cap
      for (let i = 0; i < 4; i++) {
        const x = cx + s * (0.21 + i * 0.07);
        chalkLine(ctx, st, x, cy - s * 0.12, x, cy + s * 0.11, s * 0.015); // vent slats
      }
      chalkPoly(ctx, st, [[cx + s * 0.24, cy + s * 0.10], [cx + s * 0.24, cy + s * 0.21], [cx + s * 0.06, cy + s * 0.21], [cx + s * 0.06, cy + s * 0.10]], s * 0.03); // pump/slide handle
      chalkLine(ctx, st, cx + s * 0.52, cy + s * 0.10, cx + s * 0.58, cy + s * 0.19, s * 0.025); // bayonet lug
    } },
    sawnoff: { price: 1200, draw: (ctx, st, cx, cy, s) => {
      chalkSilhouette(ctx, st, SAWNOFF_SIL, cx, cy, s);
      chalkLine(ctx, st, cx + s * 0.05, cy - s * 0.14, cx + s * 0.28, cy - s * 0.14, s * 0.025); // second barrel, both cut short
    } },
    grenade: { price: 250, draw: (ctx, st, cx, cy, s) => {
      chalkLine(ctx, st, cx, cy - s * 0.3, cx, cy - s * 0.5, s * 0.05);
      ctx.save(); ctx.globalCompositeOperation = 'lighten'; ctx.strokeStyle = 'rgba(225,222,210,0.6)';
      ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.32, s * 0.4, 0, 0, M.TAU); ctx.stroke(); ctx.restore();
      for (let i = -1; i <= 1; i++) chalkLine(ctx, st, cx - s * 0.3, cy + i * s * 0.2, cx + s * 0.3, cy + i * s * 0.2, s * 0.02);
    } },
  };
  function makeWallWeaponChalk() {
    const size = PROP, seedN = 33;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, 48, seedN, { octaves: 5, freq: 3.5, warpAmt: 0.5, warpFreq: 2.5, stops: stopsPlaster });
    ctx.drawImage(base, 0, 0);
    crackNetwork(ctx, size, seedN, { count: 2, depth: 3, width: 1, maxLen: 0.2, color: 'rgba(14,13,13,0.4)' });
    // ambient chalk dust smudge, no drawing — used as backdrop under a buy-point sign
    drawGrain(ctx, size, seedN, 0.06, 'screen');
    stains(ctx, size, seedN, { count: 2, color: [20, 20, 22], alpha: 0.2 });
    grime(ctx, size, seedN, 0.9);
    return { canvas: c, size, tile: [false, false], spec: 0.05, gloss: 0.1, emissive: 0, normal: null, tint: [1, 1, 1] };
  }
  function makeChalkGun(key, idx) {
    // No baked backdrop. The old version painted its own independent
    // plaster patch under the gun -- different noise, different seed than
    // the actual plaster_wall behind it, so it always showed up as a
    // visibly lighter rectangle with hard edges no matter how it was
    // tinted. Fully transparent (same pattern as blood_wall below) lets the
    // real wall show through and the chalk sits directly on it.
    const size = PROP, seedN = 25 + idx;
    const c = mkCanvas(size);
    const ctx = ctx2d(c); // transparent bg — overlay decal, see makeBloodWall
    const st = rng(seedN + 200);
    const def = CHALK_GUNS[key];
    def.draw(ctx, st, size * 0.48, size * 0.4, size * 0.4);
    // price in chalk digits
    ctx.save();
    ctx.globalCompositeOperation = 'lighten';
    ctx.fillStyle = 'rgba(225,222,210,0.75)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(size * 0.13)}px monospace`;
    ctx.translate(size * 0.5, size * 0.82);
    ctx.rotate(st.sym(0.03));
    ctx.fillText(String(def.price), 0, 0);
    ctx.restore();
    return { canvas: c, size, tile: [false, false], spec: 0.05, gloss: 0.1, emissive: 0, normal: null, tint: [1, 1, 1], alphaTest: 0.04 };
  }

  function makeZombieSkin() {
    const size = PROP, seedN = 34;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, 48, seedN, { octaves: 5, freq: 3.5, warpAmt: 0.55, warpFreq: 3, stops: [[0, [30, 34, 26]], [0.35, [58, 66, 50]], [0.65, [82, 90, 68]], [1, [104, 112, 86]]] });
    ctx.drawImage(base, 0, 0);
    // dark veins: thin branching lines
    crackNetwork(ctx, size, seedN, { count: 8, depth: 4, width: 0.8, maxLen: 0.22, color: 'rgba(20,30,15,0.4)' });
    // bruising: blotchy purple-green patches
    const st = rng(seedN + 200);
    for (let i = 0; i < 6; i++) {
      const x = st.f() * size, y = st.f() * size, r = size * st.range(0.05, 0.13);
      dab(ctx, x, y, r, (al) => `rgba(45,30,50,${(al * 0.4).toFixed(3)})`, 'multiply');
    }
    // torn patches showing dark red flesh beneath
    for (let i = 0; i < 4; i++) {
      const x = st.f() * size, y = st.f() * size, r = size * st.range(0.03, 0.07);
      ctx.save();
      ctx.fillStyle = 'rgba(70,15,14,0.75)';
      ctx.beginPath();
      const spikes = 7;
      ctx.moveTo(x + r, y);
      for (let k = 1; k <= spikes; k++) {
        const a = (k / spikes) * M.TAU;
        const rr = r * (0.6 + RNG.hash2(k, i) * 0.6);
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(20,10,10,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }
    grime(ctx, size, seedN, 1);
    forceSeamEdges(c);
    return { canvas: c, size, tile: [true, true], spec: 0.12, gloss: 0.15, emissive: 0, normal: null, tint: [0.66, 0.72, 0.58] };
  }
  // zombie_cloth and zombie_face removed 2026-09-02: both were fully
  // generated and registered but never referenced anywhere (repo-wide grep
  // confirmed zero call sites outside their own definitions) -- pure dead
  // weight in the atlas and the build. The zombie mesh deliberately uses a
  // single material ('zombie_skin') for the WHOLE body so a horde stays one
  // draw call per instance (see 13_models.js, buildZombieMesh's doc
  // comment) -- wiring these back in as separate per-part materials would
  // break that batching. If face/cloth detail is wanted later, the right
  // shape is to fold it INTO zombie_skin as distinct UV regions of one
  // atlas (coordinate with whoever owns the zombie mesh's UVs), not as
  // stand-alone materials.
  function makeGunMetal() {
    const size = PROP, seedN = 37;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, 40, seedN, { octaves: 4, freq: 3, warpAmt: 0.25, warpFreq: 2, stops: [[0, [8, 8, 9]], [0.5, [22, 22, 25]], [1, [42, 42, 47]]] });
    ctx.drawImage(base, 0, 0);
    scratches(ctx, size, seedN, 24, { maxLen: 0.35 });
    edgeWear(ctx, size, seedN, { count: 6, color: [150, 148, 140], amount: 1.2 });
    grime(ctx, size, seedN, 0.8);
    forceSeamEdges(c);
    return { canvas: c, size, tile: [true, true], spec: 0.14, gloss: 0.6, emissive: 0, normal: null, tint: [2.30, 2.30, 2.42] };
  }
  function makeGunWood() {
    const c = tileWood(38, PROP, { axis: 'v', count: 3, freq: 1.2, stops: stopsWoodNew, knots: false, rot: false, nails: false, gapColor: 'rgba(10,7,5,0.3)', gapWidth: 0.5, stainAmt: 0, scratchCount: 8, wear: 1.2, grime: 0.4, ao: false });
    return { canvas: c, size: PROP, tile: [true, true], spec: 0.18, gloss: 0.4, emissive: 0, normal: null, tint: [1.35, 1.30, 1.22] };
  }
  function makeHands() {
    const size = PROP, seedN = 39;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const base = baseLayer(size, 40, seedN, { octaves: 4, freq: 3, warpAmt: 0.4, warpFreq: 3, stops: [[0, [28, 32, 24]], [0.4, [56, 62, 48]], [0.75, [82, 88, 68]], [1, [104, 108, 84]]] });
    ctx.drawImage(base, 0, 0);
    // fingerless glove leather patch band across the "knuckle" zone
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(20,16,10,0.55)';
    ctx.fillRect(0, size * 0.15, size, size * 0.3);
    ctx.restore();
    scratches(ctx, size, seedN, 10, { maxLen: 0.2 });
    stains(ctx, size, seedN, { count: 3, color: [50, 10, 10], alpha: 0.25 });
    grime(ctx, size, seedN, 1);
    forceSeamEdges(c);
    return { canvas: c, size, tile: [true, true], spec: 0.06, gloss: 0.12, emissive: 0, normal: null, tint: [1.30, 1.05, 0.88] };
  }

  // ===========================================================================
  // Sprites — small RGBA canvases for decals/particles/UI. No tiling concerns.
  // ===========================================================================
  function bloodSplat(idx) {
    const size = SPR_L, seedN = 200 + idx;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const st = rng(seedN);
    const cx = size / 2, cy = size / 2;
    const n = 22 + idx * 4;
    for (let i = 0; i < n; i++) {
      const ang = st.f() * M.TAU, dist = st.f() * st.f() * size * 0.42;
      const x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist;
      const r = st.range(1.5, 7) * (1 - dist / (size * 0.5));
      if (r <= 0.4) continue;
      ctx.fillStyle = `rgba(${64 + (st.f() * 30) | 0},${8 + (st.f() * 6) | 0},${8},${st.range(0.6, 0.95).toFixed(2)})`;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * st.range(1, 2), ang, 0, M.TAU); ctx.fill();
    }
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.3);
    grad.addColorStop(0, 'rgba(50,6,6,0.9)'); grad.addColorStop(1, 'rgba(50,6,6,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, size * 0.3, 0, M.TAU); ctx.fill();
    return c;
  }
  function bulletHole(kind) {
    const size = SPR_M;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const cx = size / 2, cy = size / 2, r = size * 0.22;
    const dark = kind === 'metal' ? [10, 10, 12] : kind === 'concrete' ? [8, 8, 9] : [14, 10, 6];
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
    grad.addColorStop(0, `rgba(${dark[0]},${dark[1]},${dark[2]},0.95)`);
    grad.addColorStop(0.4, `rgba(${dark[0]},${dark[1]},${dark[2]},0.6)`);
    grad.addColorStop(1, `rgba(${dark[0]},${dark[1]},${dark[2]},0)`);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, r * 2.2, 0, M.TAU); ctx.fill();
    ctx.fillStyle = `rgba(${dark[0] * 0.4 | 0},${dark[1] * 0.4 | 0},${dark[2] * 0.4 | 0},0.95)`;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, M.TAU); ctx.fill();
    if (kind === 'wood') {
      const st = rng(210);
      ctx.save(); ctx.strokeStyle = 'rgba(60,45,28,0.7)'; ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) { const a = st.f() * M.TAU; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * st.range(1.5, 2.5), cy + Math.sin(a) * r * st.range(1.5, 2.5)); ctx.stroke(); }
      ctx.restore();
    }
    if (kind === 'metal') {
      ctx.save(); ctx.strokeStyle = 'rgba(180,170,150,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0.2, 2); ctx.stroke(); ctx.restore();
    }
    return c;
  }
  function muzzleFlash(idx) {
    const size = SPR_L;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const st = rng(220 + idx);
    const cx = size * 0.3, cy = size / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.22);
    core.addColorStop(0, 'rgba(255,244,210,1)'); core.addColorStop(0.4, 'rgba(255,190,90,0.9)'); core.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, size * 0.22, 0, M.TAU); ctx.fill();
    const spikes = 5 + idx;
    for (let i = 0; i < spikes; i++) {
      const a = st.f() * M.TAU, len = size * st.range(0.2, 0.42);
      ctx.strokeStyle = `rgba(255,210,140,${st.range(0.5, 0.9).toFixed(2)})`;
      ctx.lineWidth = st.range(2, 5);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke();
    }
    ctx.restore();
    return c;
  }
  function smokePuff() {
    const size = SPR_L;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const st = rng(230);
    for (let i = 0; i < 5; i++) {
      const x = size / 2 + st.sym(size * 0.15), y = size / 2 + st.sym(size * 0.15);
      const r = size * st.range(0.18, 0.32);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(90,88,84,0.5)'); grad.addColorStop(1, 'rgba(90,88,84,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, M.TAU); ctx.fill();
    }
    return c;
  }
  function sparkSprite() {
    const size = SPR_S;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const cx = size / 2, cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
    grad.addColorStop(0, 'rgba(255,240,180,1)'); grad.addColorStop(0.5, 'rgba(255,180,80,0.7)'); grad.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, size * 0.5, 0, M.TAU); ctx.fill();
    return c;
  }
  function dustMote() {
    const size = SPR_S;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const cx = size / 2, cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
    grad.addColorStop(0, 'rgba(200,190,170,0.5)'); grad.addColorStop(1, 'rgba(200,190,170,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, size * 0.5, 0, M.TAU); ctx.fill();
    return c;
  }
  function bloodDrop() {
    const size = SPR_S;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    ctx.fillStyle = 'rgba(90,10,10,0.9)';
    ctx.beginPath();
    ctx.moveTo(size / 2, size * 0.1);
    ctx.quadraticCurveTo(size * 0.85, size * 0.55, size / 2, size * 0.92);
    ctx.quadraticCurveTo(size * 0.15, size * 0.55, size / 2, size * 0.1);
    ctx.fill();
    return c;
  }
  function gibChunk() {
    const size = SPR_M;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const st = rng(240);
    const cx = size / 2, cy = size / 2;
    ctx.fillStyle = 'rgba(70,14,12,0.95)';
    ctx.beginPath();
    const spikes = 8;
    for (let k = 0; k <= spikes; k++) {
      const a = (k / spikes) * M.TAU;
      const r = size * 0.32 * (0.6 + st.f() * 0.5);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(160,140,120,0.5)';
    ctx.beginPath(); ctx.ellipse(cx - size * 0.05, cy, size * 0.08, size * 0.14, 0.3, 0, M.TAU); ctx.fill();
    return c;
  }
  const POWERUP_ICONS = {
    nuke: { color: [255, 190, 60], glyph: (ctx, s) => { ctx.beginPath(); ctx.arc(s / 2, s * 0.42, s * 0.16, 0, M.TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.2); ctx.lineTo(s * 0.62, s * 0.5); ctx.lineTo(s * 0.38, s * 0.5); ctx.closePath(); ctx.fill(); } },
    doublepoints: { color: [255, 220, 90], glyph: (ctx, s) => { ctx.font = `bold ${s * 0.4 | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('2x', s / 2, s * 0.52); } },
    instakill: { color: [220, 30, 30], glyph: (ctx, s) => { ctx.font = `bold ${s * 0.5 | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', s / 2, s * 0.5); } },
    carpenter: { color: [140, 100, 60], glyph: (ctx, s) => { ctx.fillRect(s * 0.2, s * 0.44, s * 0.6, s * 0.12); ctx.fillRect(s * 0.44, s * 0.2, s * 0.12, s * 0.6); } },
    maxammo: { color: [90, 200, 90], glyph: (ctx, s) => { ctx.fillRect(s * 0.38, s * 0.22, s * 0.24, s * 0.4); ctx.fillRect(s * 0.3, s * 0.6, s * 0.4, s * 0.14); } },
    deathmachine: { color: [80, 140, 220], glyph: (ctx, s) => { ctx.fillRect(s * 0.22, s * 0.46, s * 0.56, s * 0.1); ctx.fillRect(s * 0.6, s * 0.3, s * 0.16, s * 0.4); } },
  };
  function powerupIcon(id) {
    const size = SPR_L;
    const c = mkCanvas(size);
    const ctx = ctx2d(c);
    const def = POWERUP_ICONS[id];
    const cx = size / 2, cy = size / 2, r = size * 0.42;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(${def.color[0]},${def.color[1]},${def.color[2]},0.95)`);
    grad.addColorStop(1, `rgba(${def.color[0] * 0.3 | 0},${def.color[1] * 0.3 | 0},${def.color[2] * 0.3 | 0},0.9)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, M.TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,10,0.6)'; ctx.lineWidth = size * 0.02; ctx.stroke();
    ctx.fillStyle = 'rgba(15,12,8,0.9)';
    def.glyph(ctx, size);
    return c;
  }

  // ===========================================================================
  // T.build / T.get / T.sprite
  // ===========================================================================
  T.materials = {};
  T.SPRITES = {};
  T.KEYS = [];
  T.lightmapNoise = null;
  T._built = false;

  T.build = function (opts) {
    if (T._built) return;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    BASE_SEED = (opts && opts.seed) || Z.ART_SEED;
    GRAIN = null; // reset the shared atlas cache for this seed

    const M_ = T.materials;
    M_.wood_floor = makeWoodFloor();
    M_.wood_wall = makeWoodWall();
    M_.wood_plank = makeWoodPlank();
    M_.wood_stair = makeWoodStair();
    M_.plaster_wall = makePlasterWall();
    M_.brick = makeBrick();
    M_.concrete = makeConcrete();
    M_.dirt_ground = makeDirtGround();
    M_.ceiling_wood = makeCeilingWood();
    M_.rubble = makeRubble();
    M_.metal_rusty = makeMetalRusty();
    M_.sandbag = makeSandbag();
    M_.window_frame = makeWindowFrame();
    M_.roof_shingle = makeRoofShingle();
    M_.blood_wall = makeBloodWall();

    M_.crate_wood = makeCrateWood();
    M_.barrel_metal = makeBarrelMetal();
    M_.sign_help = makeSignHelp();
    M_.poster_faded = makePosterFaded();
    M_.perk_jugg = makePerkPanel(20, [150, 20, 24], 'JUGGERNOG', 'VIGOR · STAMINA · VIM');
    M_.perk_speed = makePerkPanel(21, [40, 130, 50], 'SPEED COLA', 'RAPID RELOAD');
    M_.perk_doubletap = makePerkPanel(22, [210, 160, 30], 'DOUBLE TAP', 'ROOT BEER');
    M_.perk_revive = makePerkPanel(23, [120, 165, 200], 'QUICK REVIVE', 'RESTORATIVE');
    M_.mystery_box = makeMysteryBox();
    M_.wall_weapon_chalk = makeWallWeaponChalk();
    let ci = 0;
    for (const key of Object.keys(CHALK_GUNS)) { M_['chalk_' + key] = makeChalkGun(key, ci++); }

    M_.zombie_skin = makeZombieSkin();
    M_.gun_metal = makeGunMetal();
    M_.gun_wood = makeGunWood();
    M_.hands = makeHands();

    T.KEYS = Object.keys(M_);

    // sprites
    const S = T.SPRITES;
    for (let i = 1; i <= 4; i++) S['blood_splat_' + i] = bloodSplat(i);
    S.bullet_hole_wood = bulletHole('wood');
    S.bullet_hole_concrete = bulletHole('concrete');
    S.bullet_hole_metal = bulletHole('metal');
    for (let i = 1; i <= 3; i++) S['muzzle_flash_' + i] = muzzleFlash(i);
    S.smoke_puff = smokePuff();
    S.spark = sparkSprite();
    S.dust_mote = dustMote();
    S.blood_drop = bloodDrop();
    S.gib_chunk = gibChunk();
    for (const id of Object.keys(POWERUP_ICONS)) S['powerup_icon_' + id] = powerupIcon(id);

    // lightmap grain — small tiling dither texture for the renderer
    const lm = mkCanvas(64);
    const lctx = ctx2d(lm);
    const img = lctx.createImageData(64, 64);
    const d = img.data;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const n = RNG.hash2(x, y) * 255;
      const i = (y * 64 + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255;
    }
    lctx.putImageData(img, 0, 0);
    T.lightmapNoise = lm;

    T._built = true;
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    T._buildMs = t1 - t0;
    Z.log('Z.Tex.build: ' + T.KEYS.length + ' materials, ' + Object.keys(S).length + ' sprites in ' + T._buildMs.toFixed(1) + 'ms');
  };

  T.get = function (key) {
    const m = T.materials[key];
    if (!m) throw new Error('Z.Tex.get: unknown material "' + key + '"');
    return m;
  };
  T.sprite = function (key) {
    const s = T.SPRITES[key];
    if (!s) throw new Error('Z.Tex.sprite: unknown sprite "' + key + '"');
    return s;
  };
}());
