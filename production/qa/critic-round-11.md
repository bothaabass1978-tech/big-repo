# Critic Round 11 — Blind Comparison Verdict

**Reviewer stance:** blind side-by-side against Black Ops (2010) Nacht der Untoten, judged frame by frame as if a pixel-level observer had to pick which screenshot is the real game.

**Evidence set:** `production/qa/evidence/ev-01-menu.png` through `ev-14-gameover.png` (15 frames including `ev-11b-downed.png`), captured 2026-09-02 18:12–18:13 against the current build (post round-10→11 wall-dressing + sconce-halo pass, world geometry 8808 tris).

**Method:** each frame was read as an image and judged independently; the game's own source (`src/game/*.js`) was cross-referenced to confirm whether a visual problem is a rendering symptom or a genuine content/code gap, so the fixes below point at the right layer.

---

## 1. Per-frame blind verdict

| # | Frame | Which I'd pick as the real game | The single thing that gave it away |
|---|-------|----------------------------------|--------------------------------------|
| 1 | ev-01-menu | Close call, leans real | The crate stack bottom-right is isolated and evenly lit with no companion clutter or shadow interaction — it reads as a pasted-in prop, not part of a continuous scene |
| 2 | ev-02-spawn | Fake, instantly | The pistol viewmodel: a handful of flat grey rectangular prisms with no material read — reads as a placeholder blockout gun |
| 3 | ev-03-barricade | Fake | Thin branching black "crack" scribbles cover the whole wall uniformly, reading as pen doodles laid over the plaster rather than localized stress damage; combined with perfectly even vertical light/dark wall banding it reads as a repeating tile |
| 4 | ev-04-wallbuy | Fake | Same wall scribble/banding issue as #3, now dominating a tighter frame. (The boarded window itself is the most convincing element in the shot — crossed planks read correctly) |
| 5 | ev-05-mysterybox | Fake, easily | There is no recognizable mystery box in frame — the game's second most iconic prop reads as two generic dark crates plus a floating price number. Nothing here says "roulette chest," it says "storage room" |
| 6 | ev-06-perk | Fake, but closer | The poster beside the machine is a nearly blank beige card at this light level — the "faded propaganda poster" doesn't register any print, so it looks like an unfinished placeholder decal |
| 7 | ev-07-debris | Fake immediately — worst frame in the set | The geometry itself is incoherent: a row of near-parallel flat slabs reads as venetian blinds or a z-fighting glitch, not a collapsed staircase full of rubble |
| 8 | ev-08-helproom | Fake | This is supposed to be the single most identifiable room in the map (the HELP scrawl) and the frame shows a generic boarded room with two ammo crates — no scrawl, no blood, nothing that couldn't be any other room in the house |
| 9 | ev-09-horde | Fake instantly — second-worst tell in the set | The zombie head is a flat-topped grey box with two glowing beige squares for eyes — a blocky mob silhouette, not a corpse |
| 10 | ev-10-firing | Fake | Same tell as #9, tripled — three blocky heads stacked in frame |
| 11 | ev-11-hurt | Fake, but closest of the "combat" rows | The red damage vignette itself is a reasonably convincing flat overlay; it's the blocky zombies visible through it that break the illusion, not the effect |
| 12 | ev-11b-downed | **Closest call in the whole set** | The desaturated b&w legs at the bottom are still blocky cuboids, and "YOU HAVE BLED OUT IN 21" is set in a plain system sans-serif rather than a stencil/military face — but framing, vignette and desaturation are all correct |
| 13 | ev-12-round15 | Fake immediately | Three zombie heads filling the frame with identical proportions and identical eye glow — no individual variation, they read as clones, not a round-15 horde |
| 14 | ev-13-pause | Closest to a toss-up (UI is stylized in every CoD anyway) | Nothing glaring; if pressed — the menu rows have no icon/glyph accents and "QUIT TO MAIN MENU" uses the same weight as the rest instead of being visually demoted |
| 15 | ev-14-gameover | Fake immediately | The frame is almost entirely black with a small, low-contrast dark-red "15" — reads as an unfinished loading screen, not the loud stat-reveal every CoD zombies map ends on |

**Score:** 2 of 15 frames are genuine toss-ups (ev-13, ev-11b), 1 leans real (ev-01). 12 of 15 are called instantly or on second look. That is not a passing blind test.

---

## 2. Overall verdict: **NO — the line has not been crossed.**

Round 10 was right that lighting stopped being the story. It has now been replaced by a worse problem: the two things a player's eye is on for the overwhelming majority of a session — **the zombies** and **the weapon viewmodel** — are still definitively, immediately wrong, and three of the game's specific hero props (mystery box, the collapsed-stair debris, the HELP scrawl as an actual landmark) fail to read as themselves in the very frames chosen to showcase them. A blind viewer does not need to study this evidence pack; one glance at ev-09, ev-10, or ev-12 (zombies filling the frame) is sufficient to call it. The wall-dressing pass measurably helped the two or three frames that are pure architecture (ev-03/04, marginally ev-01), but it did nothing for the frames that decide the verdict, because those frames are dominated by character models, not walls.

---

## 3. Ranked problems, most costly to the blind comparison first

### 1. Zombie model does not read as a corpse at gameplay range — HIGHEST COST
Appears in 6 of 15 frames and is the actual subject of the game. `src/game/13_models.js`, `buildZombieMesh` (~L376–410), already builds sunken eye sockets, a brow ridge, a nose ridge and cheekbone-shadow boxes — the geometric intent is correct. It does not survive to the rendered frame: the eye "glow" boxes at L402–403 span roughly half the face width each and are drawn `shade:false`, so at this scene's dim amber/blue lighting they read as two flat backlit LED squares rather than a glint inside a socket, and they wash out every other facial feature around them.
- **Fix:** shrink the eye emissive boxes to ~15–20% of current width and deepen the socket recess so they photograph as pinpricks, not panels; route the glow through a small emissive sprite/decal (the halo-sprite technique already built for the wall sconces this round is directly reusable) instead of an unshaded box. Separately, bake a darker AO gradient into the `zombie_skin` material around brow/cheek/jaw (material built in `src/game/06_textures.js`, `makeZombieSkin`) so the shape still reads when this level's low light flattens the 2–3 cm of geometric relief.

### 2. Mystery box has no distinguishing silhouette
The game's second most iconic prop is currently a single undecorated box. Confirmed in `src/game/19_econ.js` L76–78:
```
b.box([-0.5, 0, -0.35], [0.5, 0.62, 0.35], { uvScale: 1 });
boxMesh = Z.Render.uploadMesh(b.finish('mystery_box'));
```
No lid, no topper, no light — same silhouette family as the crate clutter around it, so in ev-05 it disappears into the room.
- **Fix:** build the box as two parts — a base chest plus a separate lid box offset/rotated to read as ajar — and add a small billboard/sprite quad above it reusing the halo-sprite pattern from the sconce work this round, tinted to suggest the rotating neon "?" topper. This single change fixes the frame that currently underperforms hardest relative to how recognizable the real prop is.

### 3. Debris barricade reads as broken geometry, not rubble
`src/game/09_level.js` L426–434, the `rubble` box loop for `stairs_west`/`stairs_east`: 5 near-parallel, near-full-height slabs in a shallow depth band, all facing the same way. This is the frame (ev-07) that would be dismissed as a rendering bug rather than as fake-but-plausible content, and it gates the only progression path in the map, so players see it constantly.
- **Fix:** replace the uniform loop with varied-rotation, varied-height fragments — a couple of genuinely angled/toppled pieces, 1–2 horizontal cross-beams, staggered top heights — so the silhouette stops reading as venetian blinds.

### 4. Plaster wall crack decals read as pen-doodle scribble
Present on every interior wall in every frame, so it is a constant low-grade tell even where each instance looks minor in isolation. `src/game/06_textures.js` L916, inside `makePlasterWall`:
```
crackNetwork(ctx, size, seedN, { count: 9, depth: 5, width: 1.4, maxLen: 0.42, color: 'rgba(12,10,9,0.6)' });
```
`maxLen: 0.42` (42% of the tile) with a single flat stroke color/width is what produces the branching, wall-spanning squiggle look in ev-02/03/04/08.
- **Fix:** cut `maxLen` to roughly 0.15–0.2 so cracks read as localized stress rather than a wall-length scrawl; vary stroke width along each crack instead of a constant 1.4; add a 1px pale highlight offset to fake the crack's raised inner edge and give it depth instead of flat ink.

### 5. Poster art doesn't survive the scene's contrast
`src/game/06_textures.js` L1432–1451, inside `makePosterFaded`. The intent is right — "illegible printed content: rows of grey smudge text + a faded emblem shape" — but it's drawn at `multiply` alpha 0.1–0.3 (emblem at 0.25) over a base that is already light (`stops: [[0,[40,36,26]],[0.5,[110,100,78]],[1,[160,148,118]]]`), so at this level's ambient light the print doesn't survive to the framebuffer. What should be a faded propaganda poster reads as a blank tan card in ev-06.
- **Fix:** darken the base fill stops or raise the print pass alpha to roughly 0.25–0.5 so the smudge text and emblem stay visible at this scene's brightness.

### 6. HELP scrawl isn't functioning as the room's landmark
Two separate issues, neither of which is "the asset is bad" — `sign_help` (`src/game/06_textures.js` L1349–1391) is a genuinely well-built blood-drip HELP texture with drips, cracks and stains, better than most of what's around it.
- (a) **Capture bug, not content bug:** `tools/harness/evidence.mjs` L91–95 teleports the ev-08 camera to `(-4.0, 3.62, -4.0)` facing `yaw = Math.PI*0.02` (north), but the sign sits on the room's *south* wall stub at `z ≈ -2.1` (`src/game/09_level.js` L386–387) — behind the camera. The evidence pack currently contains zero frames of the game's single most identifiable room feature.
- (b) **Room-anchoring gap that's real regardless:** `src/game/09_level.js` L568–581 places crates either side of the sign but nothing directly under or against it — the real map pools blood and pushes debris up against that wall so the eye lands on the scrawl as the room's landmark. Here it's just another patch of plaster with clutter nearby, not clutter *pointing at it*.
- **Fix:** correct the evidence camera yaw so this asset is actually represented in future evidence packs, and add a dressing element directly beneath the sign (a blood-pool decal or a single low prop pushed against the wall) so it reads as a destination, not incidental wall art.

### 7. Game over screen underdelivers for the genre
`src/game/20_hud.js`, `drawGameOver` (~L1188–1220). Reveal timing is fine — it settles well within the harness's 4.2 s wait. The problem is presentation: `ROUND REACHED` and the round number render in a dark, low-contrast red against pure black with no supporting graphic, so ev-14 reads as an unfinished loading screen rather than the loud stat-reveal every CoD zombies map ends on.
- **Fix:** brighten/saturate `COL.roundRed`, or add a supporting graphic element (skull motif, border flourish, brighter background wash) so the frame carries enough visual weight to be believable as a finished screen.

### 8. Weapon viewmodel fidelity is still prototype-grade
Visible in nearly every gameplay frame's bottom-right corner (ev-02 through ev-12): flat grey rectangular prisms with no material differentiation between wood stock and blued steel. Not root-caused this round (didn't get to the weapon-model construction code) — flagging for a follow-up pass, but it is a consistent, repeated tell across the whole gameplay half of the evidence set.

### 9. Wall-dressing pass isn't landing in the frames that matter
The round-10→11 dressing pass (`src/game/09_level.js` L729–745, the `DRESS_KINDS`/`DRESS_RUNS` loop) genuinely helps the frames where it lands, but its 16% skip chance (L734) combined with 0.95–1.9 unit spacing (L733) is leaving exactly the kind of multi-meter gaps visible directly behind the spawn point (ev-02) and inside the mystery-box room (ev-05) — the two highest-traffic rooms in the map.
- **Fix:** tighten spacing to ~0.7–1.3 and/or lower the skip chance to ~8–10% specifically for wall runs flagged as belonging to spawn/box rooms, rather than applying one global density to every run.

---

## 4. THE SINGLE HIGHEST-VALUE CHANGE REMAINING

**Fix the zombie head/eye read (Problem #1).** Every other item on this list affects one or two evidence frames; the zombie model is on screen, filling a large fraction of the frame, in six of fifteen — including the three frames (ev-09, ev-10, ev-12) that are the fastest instant "fake" calls in the entire set. The geometry to fix this already exists in `buildZombieMesh` (brow, nose, sockets, cheekbones are all there); the fix is shrinking/re-routing the eye emissive and adding texture-baked AO so that geometry survives this scene's lighting instead of being overpowered by two oversized glowing squares. Nothing else this round will move the blind-comparison score as much per line of code changed.
