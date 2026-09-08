# Critic Round 12 — Blind Comparison Verdict

**Reviewer stance:** blind side-by-side against Black Ops (2010) Nacht der Untoten, judged frame by frame as if a pixel-level observer had to pick which screenshot is the real game.

**Evidence set:** `production/qa/evidence/ev-01-menu.png` through `ev-14-gameover.png` (15 frames including `ev-11b-downed.png`), plus four supplementary close-up captures I took this round (`cu-zombie-face.png`, `cu-viewmodel-hip.png`, `cu-mysterybox-close.png`, `cu-debris-wide.png`, in the scratchpad) to check specific claims from the round's changelog against the rendered result. Build regenerated via `node tools/build.mjs` before capture; source cross-referenced in `src/game/08_mesh.js`, `src/game/13_models.js`, `src/game/09_level.js`, `src/game/19_econ.js`, `tools/harness/evidence.mjs`.

**Context:** the mystery box and debris pile are mid-rewrite as of this review (per coordinator). They are judged below on what the evidence pack actually shows, flagged **in flight**, not scored as a settled regression or a settled fix.

---

## 1. Per-frame blind verdict

| # | Frame | Which I'd pick as the real game | The single thing that gave it away |
|---|-------|----------------------------------|--------------------------------------|
| 1 | ev-01-menu | Close call, leans real | Same as round 11 — crate stack bottom-right still isolated, evenly lit, no shadow interaction with the room |
| 2 | ev-02-spawn | Fake, but closer than round 11 | The pistol viewmodel now actually carries a texture and a warm tint that matches the room (the UV/lighting fix is visible and real) — but the mesh itself is still 4-5 flat rectangular prisms with no slide/grip/frame differentiation, so the silhouette still reads as a blockout |
| 3 | ev-03-barricade | Fake | Identical tell to round 11: branching pen-doodle wall cracks spanning the whole plaster tile, even light/dark vertical banding |
| 4 | ev-04-wallbuy | Fake | Same crack/banding issue, tighter frame. The chalk weapon outline + price ("200") is genuinely one of the better-reading elements in the set — thin, hand-drawn, plausible |
| 5 | ev-05-mysterybox | Fake, easily | Unchanged from round 11 — two generic dark crates, no lid, no light, no "?" topper. Still reads as a storage nook, not the box (in flight per coordinator) |
| 6 | ev-06-perk | Fake, but the machine itself is close | Quick Revive machine + backlit sign reads decently now; what breaks it is the poster patch top-left of the brick wall, still a near-blank beige card at this light level |
| 7 | ev-07-debris | Fake immediately | Still reads as a row of near-parallel vertical slabs / venetian blinds, not a collapsed staircase, despite source now containing genuine masonry-lump variation (in flight per coordinator — see §3.4) |
| 8 | ev-08-helproom | Fake | Still no HELP scrawl in frame — the evidence-harness camera bug from round 11 is still present verbatim, so the game's most identifiable room feature is still unrepresented in the pack |
| 9 | ev-09-horde | Fake instantly | Zombie heads are still flat-fronted grey-green boxes with two amber squares; the squares are smaller and correctly amber (not blown-out cream) now, which is a real change, but the brow/nose/cheek relief the code claims to add does not survive this scene's flat lighting |
| 10 | ev-10-firing | Fake | Same tell as #9, tripled |
| 11 | ev-11-hurt | Fake, but the effect itself is convincing | Red vignette is a solid flat overlay; the blocky zombie heads visible through it are what breaks it |
| 12 | ev-11b-downed | Closest call in the set | Unchanged from round 11 — blocky b&w legs, plain system-sans "YOU HAVE BLED OUT IN 21", but vignette/desaturation/framing all read correctly |
| 13 | ev-12-round15 | Fake immediately — **new worst frame in the set** | A helmet-variant zombie fills the foreground as a smooth-shaded octagonal prism (the stahlhelm cylinder) with two small amber dots low on its face. It doesn't read as "a zombie in a helmet" — it reads as a sentry turret or a broken mesh. This is a worse tell than the plain zombie head it's meant to be a variant of |
| 14 | ev-13-pause | Closest to a toss-up | Unchanged from round 11 |
| 15 | ev-14-gameover | Fake immediately | "ROUND REACHED / 15" is marginally brighter/larger than round 11's capture but the frame is still >90% pure black with no supporting graphic — reads as an unfinished screen |

**Score:** 2 of 15 frames are genuine toss-ups (ev-11b, ev-13), 1 leans real (ev-01). Same as round 11 numerically, but the composition of the "instant fake" pile shifted: the weapon-viewmodel tell got measurably weaker (material fix landed), while a new instant-fake frame (ev-12, the helmet zombie) got worse than anything in round 11's set.

---

## 2. Overall verdict: **NO — the line has not been crossed.**

The round's actual work (UV-scale fix, viewmodel relighting, eye desaturation/resize, floor/wall tint pass, wall dressing) is real and it shows: the weapon viewmodel and the plain zombie eyes are both measurably better than round 11 when inspected closely (`cu-viewmodel-hip.png`, `cu-zombie-face.png` vs. the round-11 report's description). But none of it changed the verdict on the frames that decide a blind test, because those frames are dominated by shape/silhouette, not material — and shape was not what this round touched. Worse, the evidence pack now contains a frame (ev-12, the helmet zombie) that is a more immediate "fake" tell than anything in round 11's set. The two hero props flagged as the next priority in round 11 (mystery box, debris) are still, as captured, unresolved — they are described as in-flight, so this is not scored as a missed commitment, but the blind-comparison math does not care about work in progress: as of this evidence pack, ev-05 and ev-07 are still called instantly and for the same reasons as last time.

---

## 3. Ranked problems, most costly to the blind comparison first

### 1. Helmet-variant zombie reads as a sentry turret, not a corpse — NEW WORST TELL
`src/game/13_models.js` L436-442, the `if (opts.helmet)` block:
```js
b.cyl(hx, hz, 0.02 * rk, 0.098 * rk, hy + 0.14, hy + 0.185, 8, { caps: false, uvScale: 3 });
b.cyl(hx, hz, 0.098 * rk, 0.104 * rk, hy + 0.10, hy + 0.145, 8, { caps: true, uvScale: 3 });
box(b, hx - 0.108 * rk, hy + 0.088, hz - 0.112 * rk, hx + 0.108 * rk, hy + 0.108, hz + 0.112 * rk, COL.helmetDark);
```
At 8 segments and a flat `COL.helmet` fill with no texture variation, the cylinder reads as a hard octagon prism, not a rounded stahlhelm, and the brim sits low enough to shadow out the brow-ridge/nose-ridge/socket geometry that makes the *unhelmeted* head read as a face at all. Confirmed at close range in `ev-12-round15.png` and my own `cu-zombie-face.png` — the result is a smooth grey polygon block with two dim amber dots, closer to a robot than a corpse.
- **Fix:** bump both `cyl()` calls' segment count from 8 to 14-16 so the silhouette stops reading as a hard-edged octagon; either raise the brim box (L441) so the eye sockets stay visible below the rim, or add a texture (`gun_metal`-style rust/dent noise) to `COL.helmet` instead of a flat fill so the shell itself has legible surface detail even when it's the dominant shape in frame.

### 2. Base zombie head/eye still fails to read as a corpse at gameplay range
`src/game/13_models.js` L393-434. The changes this round are real and confirmed in source — the eye-glow box shrank from spanning roughly half the socket to `0.013 * rk` wide (about 8% of head width), it's routed through `setEmissive(0.6)` instead of a raw unshaded fill, and the surrounding dark socket/cheekbone-shadow boxes are present. None of that is imaginary. But in every frame where a zombie fills a meaningful part of the screen (ev-09, ev-10, ev-12) and in my own straight-on `cu-zombie-face.png`, the net read is still a flat grey-green box with two amber squares — the brow/nose/cheek relief does not survive this scene's low, largely frontal lighting because none of the skin materials carry baked ambient occlusion; the shape relief is ~2-3 cm of geometry lit almost flat.
- **Fix:** bake a darker AO gradient into brow/cheek/jaw directly in the `zombie_skin` texture (`src/game/06_textures.js`, `makeZombieSkin` — not touched this round per the changelog) so the geometric relief has a contrast cue independent of the scene's real-time lighting angle. This is the one round-11 recommendation for problem #1 that has not yet been done; the eye-glow half of that recommendation has been.

### 3. Mystery box has no distinguishing silhouette — in flight, unresolved as captured
`src/game/19_econ.js` ~L76-78 (per round-11 line numbers; not re-diffed this round since it's being actively rewritten). As captured in `ev-05-mysterybox.png` and my own closer `cu-mysterybox-close.png`, it is still two plain crates with no lid, no light, no rotating-topper billboard. Whatever rewrite is in flight has not landed in a build the evidence pack has seen yet.
- **Fix (unchanged from round 11):** base + separate offset/rotated lid, plus a small emissive billboard quad above it reusing the sconce-halo sprite technique, so it stops disappearing into the surrounding crate clutter.

### 4. Debris barricade still reads as slabs, not rubble — in flight, and the in-progress fix needs one more push
`src/game/09_level.js` L441-484, `debrisPile()`. This is genuinely mid-rewrite: the current source already generates 16 masonry lumps of varied size, 5 splintered joists at varied aspect/height, and 3 buried crates — a real attempt at the round-11 recommendation. It is not landing visually yet (`ev-07-debris.png`, `cu-debris-wide.png` both still read as near-parallel verticals) for a structural reason: the very first thing placed, and the dominant visual mass at close range, is a single full-height (1.62 m), full-width "plug" box (L445-446) sitting right behind everything else — one flat rubble-textured wall filling the opening. The masonry/joist/crate variety in front of it reads as detail on a wall, not as the wall's replacement. Compounding this, the renderer's boxes are axis-aligned only (the code comment at L459-461 says as much: `"angle" is aspect ratio and height`, not real rotation), so even the varied pieces can't tilt — up close their parallel edges still line up like fencing.
- **Fix:** break up the plug's own top/front silhouette (stagger its top height per-column instead of one flat plane, or split it into 4-5 irregular-width sub-boxes at different heights) rather than relying only on the dressing in front of it; if the mesh builder is going to stay axis-aligned-box-only, the plug needs to stop being one clean rectangle.

### 5. Plaster wall crack decals still read as pen-doodle scribble — untouched this round
`src/game/06_textures.js`, `makePlasterWall`, `crackNetwork()` call (~L916), still visible identically in `ev-03`, `ev-04`, `ev-08`, and the background of `cu-debris-wide.png`. Not mentioned in this round's changelog, so presumably not attempted.
- **Fix (unchanged from round 11):** cut `maxLen` from ~0.42 to ~0.15-0.2, vary stroke width along each crack, add a 1px pale highlight offset for a raised inner edge.

### 6. HELP room evidence-capture bug still not fixed
`tools/harness/evidence.mjs` L91-95 is byte-for-byte the same camera setup round 11 flagged: `G.debug.teleport(-4.0, 3.62, -4.0); G.player.yaw = Math.PI * 0.02;`, still facing north/away from the sign on the room's south wall (`src/game/09_level.js` ~L384-387). This is a one-line fix that has now been carried across two review rounds without being applied, and it means the game's single most identifiable room feature has never once appeared in an evidence pack.
- **Fix:** point the ev-08 camera at the HELP wall, not away from it.

### 7. Poster art still doesn't survive the scene's contrast
`src/game/06_textures.js`, `makePosterFaded` (~L1432-1451). Confirmed unchanged in `ev-06-perk.png` — the poster patch top-left of frame is still a near-blank beige card. Not addressed this round.
- **Fix (unchanged from round 11):** darken base fill stops or raise print-pass alpha to ~0.25-0.5.

### 8. Game over screen still underdelivers for the genre
`src/game/20_hud.js`, `drawGameOver` (~L1188-1220). `ev-14-gameover.png` shows a slightly brighter/larger "15" than round 11's capture, but the screen is still almost entirely black with no supporting graphic — a marginal change, not a fix.
- **Fix (unchanged from round 11):** brighten/saturate `COL.roundRed` further and/or add a supporting graphic element so the frame carries visual weight.

### 9. Weapon viewmodel shape is still prototype-grade, but the material fix genuinely helped
Visible in nearly every gameplay frame. The `setUvMul`/relighting work (`src/game/08_mesh.js` L29-43, `src/game/13_models.js` L343) is a real, confirmed improvement — the pistol now shows an actual texture pattern and a warm tint matched to the room instead of flat neutral grey (compare `cu-viewmodel-hip.png` to round 11's description). What's left is pure geometry: the mesh is still a handful of undifferentiated rectangular prisms (no separate slide/grip/frame reads). Downgraded in priority from round 11 because the material half of this problem is now solved; only the shape half remains.

---

## 4. THE SINGLE HIGHEST-VALUE CHANGE REMAINING

**Finish the zombie head: apply baked AO to `zombie_skin` (problem #2) and fix the helmet variant's silhouette (problem #1).** These two are really one target — "make a zombie read as a corpse, not a box, in every variant" — and together they still gate more frames than anything else in the set (ev-09, ev-10, ev-12 are three of the four fastest "fake" calls in the whole pack, and ev-12 is now the single worst frame this review produced). The eye-glow half of this work landed this round and it was the right call; the AO/texture-contrast half is what's left, and the helmet variant currently undoes even the progress that was made, because its flat-fill octagon shell hides the facial relief entirely. Nothing else on this list touches as many frames per line of code changed.

---

## 5. Round-11 findings: resolved / unchanged / regressed

**Resolved:**
- Gun/zombie flat-untextured-mesh bug (UV scale authored in tiles/metre applied to sub-metre models) — genuinely fixed via `Mesh.Builder.setUvMul()`; confirmed both in source (`src/game/08_mesh.js` L29-43) and visually (gun and zombie skin both show real texture detail now, e.g. blotches/blood spots on zombie torsos in `ev-09`, waffle/checker pattern on the pistol in `cu-viewmodel-hip.png`).
- Viewmodel lit as a flat neutral-grey studio prop instead of the room — fixed; the pistol now visibly picks up the room's warm amber tone in `ev-02`, `ev-04`, `ev-06`.
- Zombie eye glow clipping to cream/blown-out rectangles — fixed at the code and visual level; eyes read amber/orange now, not cream, in every horde frame.

**Unchanged:**
- Mystery box silhouette (round-11 #2) — **in flight**, unresolved as captured this round.
- Debris barricade readability (round-11 #3) — **in flight**; a real rewrite exists in source with masonry/joist/crate variety, but it has not yet changed the rendered read, for the structural reason described in §3.4.
- Plaster wall crack scribble (round-11 #4) — untouched.
- Poster contrast (round-11 #5) — untouched.
- HELP room evidence-capture camera bug (round-11 #6a) — untouched, same exact coordinates as last round.
- HELP room dressing/blood-pool anchor (round-11 #6b) — not verifiable this round since the capture bug still prevents the room from appearing in evidence at all.
- Game over screen presentation (round-11 #7) — marginal contrast/size bump only; substantively the same problem.
- Wall-dressing density in spawn/box rooms (round-11 #9) — not reverified this round; no changelog entry claims it was touched.

**Regressed / newly exposed (not previously flagged, arguably worse than anything round 11 saw):**
- Helmet-variant zombie silhouette. Round 11's evidence pack never put a helmet zombie in close frame, so this wasn't previously scored, but as of `ev-12-round15.png` it is now the single fastest "fake" call in the set — worse than the plain zombie box-head tell it's a variant of. See §3.1.
