# ADR-0013: BlockForge Performance on Weak Devices

## Status

Accepted

## Date

2026-09-27

## Last Verified

2026-09-27

## Decision Makers

Project owner ("since my laptop is really bad blockforge is really laggy, low
fps and runs slowly optimize it so it runs as smooth as possible"); Claude
Code session (technical design and implementation).

## Summary

BlockForge now adapts to the machine it runs on:

- a frame-rate governor lowers render resolution and turns shadows off when a
  game runs slowly
- weak devices get cheaper Lambert shading and lighter page effects
- 3D thumbnails render only when the page is idle and never during a game,
  and are cached for good in IndexedDB
- the 4-second world tick no longer rebuilds the page you are looking at

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser JavaScript, three.js r159) |
| **Domain** | Rendering / Performance |
| **Knowledge Risk** | LOW |
| **References Consulted** | three.js r159 renderer and material APIs (vendored) |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `perf_test.js` (5 tests); profiling under 4× CPU throttling (below); e2e |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0005 (3D rendering, thumbnails), ADR-0007 (creator earnings), ADR-0003 (runtime) |
| **Enables** | Smooth play on low-end laptops |
| **Blocks** | None |
| **Ordering Note** | `engine/perf.js` loads after `engine/g3d.js` and before the thumbnail, avatar and runtime modules |

## Context

We profiled Chromium with the CPU throttled 4× and software WebGL, a stand-in
for a weak laptop with integrated graphics:

- Home and Discover ran at about 4 fps while 3D thumbnails rendered. Each
  thumbnail was a 600-1000 ms main-thread block.
- Thumbnails were cached for only 28 games, so about 80 re-rendered on every
  visit.
- Games ran at 2-3 fps, with full-resolution PBR shading and soft shadows.
- The creator simulation marked `created` as changed on every tick. Home,
  Discover, game pages and profiles watch that slice, so they fully
  re-rendered every 4 seconds for anyone with a published game.
- CPU profiles showed about 93% of game time in pixel work, not JavaScript.

## Decision

### `BF.perf` (`engine/perf.js`)

- **`tier()`** returns `low` or `normal`. A device is low if it has 4 or fewer
  cores, 4 GB or less of memory, or a software or entry-level GPU (read from
  the WebGL renderer string). A game the governor has to push to "Fast" also
  marks the device low. The result is stored in localStorage.
- **`governor(world)`** runs per game session, with levels in `T.levels`:

  | Level | Resolution | Shadows |
  |-------|------------|---------|
  | Sharp | 100% | on |
  | Balanced | 85% | off |
  | Fast | 70% | off |
  | Fastest | 55% | off |

  - The frame rate is smoothed over about half a second of real time.
  - The level drops after 1.5 s below 45 fps and rises after 8 s above 57 fps.
  - The first 1.2 s of a game are ignored.
  - Only Auto graphics adapts. High is fixed at Sharp. Low starts at, and never
    goes sharper than, Fast.
  - The level is remembered per device (`bf.perf.level`), so the next game
    starts where the last one settled.
  - `World.setLevel` changes the renderer pixel ratio and toggles shadows.
- **`idle(fn)`** runs one background job at a time, with these rules:
  - It uses `requestIdleCallback` when the browser has it.
  - Jobs never run during a game or in a hidden tab.
  - After each job it waits at least 140 ms, or as long as the job took (twice
    as long on low-tier devices).
- **`lite()`** is true on low-tier devices or with Reduce motion. It adds
  `body.perf-lite`, which turns off backdrop blur, looping avatar-SVG
  animations, shimmer sweeps and skeleton animation.

### Rendering

- **Shading.** On low-tier devices or with Low graphics, `mat()` builds
  `MeshLambertMaterial` instead of `MeshStandardMaterial`. The lite flag is part
  of the material cache key.
- **Thumbnails.**
  - Renders go through `perf.idle`.
  - Low-tier devices render the 3D at 75% size without shadows. The title is
    still lettered at full size.
  - Renders are cached in the IndexedDB database `blockforge-thumbs`, which is
    loaded at startup. Queued jobs whose render is already cached swap in
    without rendering.
  - Older cache versions are swept, and localStorage stays as the fallback.
- **Avatar thumbnails** render in 6 ms slices of each frame on low-tier devices
  (12 ms otherwise), and at most one every 250 ms during a game.

### Page updates

- `creator.simulate()` marks a new slice, `creatorStats`, instead of `created`.
- Pages that list games keep watching `created`, so they rebuild only when the
  list itself changes.
- These still watch `creatorStats`: the game dashboard's Overview tab, the
  Create page's earnings panel, and achievement evaluation.

## Alternatives Considered

### A manual "performance mode" only
Rejected as the only fix: people on slow machines should not have to find a
setting. Auto adapts by itself, and High, Low and Classic 2D stay available.

### Merging static geometry to cut draw calls
Deferred: after the changes above, the profile is dominated by pixel work,
not draw calls, and merging would touch every game module.

## Consequences

### Positive

Measured under 4× CPU throttling with software WebGL:

| Measure | Before | After |
|---------|--------|-------|
| Home fps while thumbnails render | 4 | ~40 |
| Home fps, settled | 59 | 54 |
| Discover fps | 4 | 40 |
| World tick | 15 ms | 2-10 ms |
| Sky Obby fps | 2 | 11 |
| Block Battlegrounds fps | 2 | 17 |
| Hexfall fps | 2 | 14 |
| Metro Dash fps | 3 | 18 |
| Zombie Outbreak fps | 3 | 16 |

A real integrated GPU is much faster than software WebGL, so real devices sit
well above these numbers.

### Negative

- On weak devices, shading loses its metallic sheen, and scenes are softer at
  the lower levels.
- The first time a shadow toggle happens, shaders recompile, which causes one
  short hitch.

### Risks

- IndexedDB can be unavailable (private mode). Thumbnails then fall back to
  localStorage and re-render as before.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Product brief (BlockForge) | Run smoothly on a weak laptop | Governor, Lambert shading, idle thumbnails with a permanent cache, no page rebuilds on ticks, lite effects |

## Performance Implications

This ADR is about performance. The measurements are under Consequences.

## Validation Criteria

- **Unit (`perf_test.js`):**
  - the governor steps down when slow and up when smooth
  - the level is remembered for the next game
  - High graphics stays fixed, and Low never goes sharper than Fast
  - background jobs wait while a game runs
  - the world tick marks `creatorStats`, not `created`
- **Manual profiling.** The numbers above come from `Emulation.setCPUThrottlingRate` 4 in Chromium.

## Related Decisions

ADR-0003, ADR-0005, ADR-0007.
