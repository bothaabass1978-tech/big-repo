# ADR-0005: BlockForge 3D Rendering for Games and Avatars

## Status

Accepted

## Date

2026-09-25

## Last Verified

2026-09-26

## Decision Makers

Project owner ("make all the games and avatars 3d"); Claude Code session
(technical design and implementation).

## Summary

Every BlockForge game and every avatar now renders in 3D with three.js,
vendored as one file so the app still opens from disk with no build step.
Game logic is unchanged: modules keep simulating in their 2D game
coordinates, and a per-module `render3d(dt)` view mirrors that state into a
shared 3D `World`. HUD text and menus stay on a transparent 2D canvas on top.
A Graphics setting (Auto, High, Low, Classic 2D) picks the quality or falls
back to the original 2D renderer, which also covers devices without WebGL.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser). three.js r159 UMD build, vendored at `src/blockforge/vendor/three.min.js` (MIT, licence alongside) |
| **Domain** | Rendering / Core |
| **Knowledge Risk** | LOW (three.js r159 predates the model cutoff) |
| **References Consulted** | three.js r159 docs: WebGLRenderer, InstancedMesh, MeshStandardMaterial, BufferGeometry, Raycaster |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | e2e smoke test ("every game renders in 3D", "Classic 2D ... flat renderer"), per-game screenshots in low and high quality |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (script-order architecture, no bundler), ADR-0003 (module contract) |
| **Enables** | 3D avatars in the UI, 3D versions of all 20 games, Studio-built levels rendered in 3D (ADR-0007) |
| **Blocks** | None |
| **Ordering Note** | `vendor/three.min.js` loads first; `engine/g3d.js`, `engine/avatar3d.js`, `engine/props3d.js` load after `engine/gfx.js` and before `engine/runtime.js` |

## Context

The request was to make "all the games and avatars 3d". The 20 game modules
already had tuned 2D simulations (collision, AI, balance) and tests. Rewriting
each simulation in 3D would have thrown that away and multiplied risk. The app
must also keep working opened straight from `file://`, on phones, and in
headless Chromium (software WebGL) for the test suite.

## Decision

### Architecture

```
BF.runtime frame (ADR-0003)
  module.update(dt)                 game logic in 960×540 game coordinates (unchanged)
  if session.use3d:
    module.render3d(dt)             mirror state into ctx.g3 (a BF.g3d World)
    world.update(dt) · world.render()        WebGL canvas  (canvas.gr-3d, z-index 0)
    hud.clearRect · world.drawOverlay(hud)   name tags, HP bars, bubbles, floating text
    module.hud(g)                   2D HUD on a transparent canvas (#gr-canvas.hud)
  else:
    module.draw(g)                  the original 2D renderer (Classic 2D)
```

- `session.use3d = module.three && BF.g3d.enabled()`; `enabled()` is false
  without WebGL, after a context loss, or when Graphics is Classic 2D.
- A fresh `World` is made for every session and restart and disposed on leave.
  Geometries, cached materials and canvas textures are shared across worlds.

### Coordinate conventions

- **Top-down games** (arena, racing, city, pets …): game `(x, y)` maps to world
  `(X = x, Y = height, Z = y)`, 1 unit = 1 game pixel. Rig facing uses
  `faceAngle(a)`; vehicles use `rotation.y = -heading`.
- **Side-view games** (Sky Obby, Mega Miners, Castle Siege): `X = x`,
  `Y = -y` or `Y = ground - y`, and the level runs along `Z = 0` with a
  three-quarter camera.
- **Mystery Mansion** (point and click): each room's back wall is the plane
  `Z = 0`, and the camera is placed so that plane maps 1:1 onto the 960×540
  screen. The existing hotspot rectangles, puzzles and the cellar secret
  (ADR-0004) therefore keep working without changes.
- Pointer input: `ctx.pointerWorld(h)` ray-picks the ground plane at height
  `h` and returns game coordinates, so aiming and clicking code only swaps its
  source of `(x, y)`.

### Key interfaces

```js
BF.g3d.world(opts) → World
World: preset(name) · box/shape/ground/gridFloor/strip · boxes(items)  (InstancedMesh, one draw call)
       particles2d(h, map) · floaters2d(h, map)   (drop-in for BF.Particles / BF.Floaters)
       pool() (keyed meshes, swept each frame) · actor(id, avatar, {scale}) (avatar rig, swept)
       label(x, y, z, {name, hp, bubble}) · look(tx, ty, tz, {dist, pitch, yaw, fov, lerp})
       toScreen · groundAt · wallAt · pick
BF.char3d.build(avatarOrLook) → Rig: set({move, air, mode}) · play('attack'|'hit') · emote · hold(tool)
BF.avatar3d.image(av, {size, crop}) · live(el, av)     UI thumbnails and the live avatar viewer
BF.props3d.pet / car / zombie / ship                    merged, vertex-coloured props (1–3 draw calls)
```

### Performance rules

- Batch static scenery with `World.boxes()`; give dynamic crowds merged props
  (`props3d`) instead of full avatar rigs.
- Keep each game at roughly 100–250 draw calls. Measured JS time is about
  3 ms per frame; headless software rendering is slow, so tests use Low.
- Low quality: no shadows and device pixel ratio capped below 1.
  Auto picks Low on screens under 600 px.
- Instanced meshes whose contents change every frame set
  `frustumCulled = false`, because their bounds are computed once while empty.

### Fit and spacing rules (added 2026-09-26)

Added after player feedback that models clipped through each other.

- **Personal space.** `World.separate()` runs every frame before rigs animate.
  Characters closer than 1.35 × their combined scale are eased apart, at most
  2.2 × scale, and only in what is drawn. Game positions, collisions and tests
  are unchanged. Side-view games limit the push to one axis
  (`World.sepAxis = 'z'` for Obby, Siege and Mansion, `'x'` for Miners) so no
  one is pushed off a ledge. `actor(id, av, {solid: false})` opts a rig out.
  Name tags follow the nudge and step upward instead of overlapping.
- **Avatar fit.** The head is a 1.25 cube (top 1.285, sides ±0.625).
  - Hats that cover the crown (cap, beanie, explorer, wizard, viking) hide the
    top of the hair; only a short fringe below the brim remains.
  - Sculpted heads (pumpkin, robot, crystal, void) never get hair.
  - Crowns are square bands so they wrap a blocky head.
  - Shoes stay inside the leg's width.
  - Rocket-boot flames only show in the air.
  - Back items stay clear of the torso (z −0.5) and arms (x ±1).
- **Instanced tilt.** `World.boxes()` items accept `rx` and `rz` as well as
  `rot`, for things like drooping palm fronds.
- **Checks.** A "fitting room" render of every wearable (front and back) and
  close orbit shots around the player in each game are used to review fit.

## Alternatives Considered

### Alternative 1: Rewrite each simulation natively in 3D

- **Pros**: Could use 3D physics and true vertical gameplay.
- **Cons**: Twenty rewrites of balanced, tested logic; high regression risk;
  large scope.
- **Rejection Reason**: Mirroring 2D state into 3D keeps every rule, test and
  bot behaviour, and still gives full 3D visuals.

### Alternative 2: Load three.js from a CDN or use a bundler

- **Pros**: Smaller repository.
- **Cons**: Breaks offline and `file://` use; adds a build step (ADR-0001).
- **Rejection Reason**: One vendored UMD file keeps the zero-install promise.

### Alternative 3: Pre-rendered sprites of 3D models

- **Pros**: Cheap at runtime.
- **Cons**: No camera movement, lighting or depth; avatars change constantly
  with equipped items.
- **Rejection Reason**: Real-time rigs are needed for customised avatars.

## Consequences

### Positive

- All 20 games and every avatar surface (shop, editor, profiles, friends) are
  3D, while game logic and its tests are untouched.
- Classic 2D remains a supported fallback and a working setting.

### Negative

- The page is heavier (three.js is about 650 KB minified).
- Each module now carries two renderers that must stay in sync.

### Risks

- Weak GPUs: mitigated by Auto/Low quality, merged props and batched scenery.
- WebGL context loss: `BF.g3d.lost` switches new sessions to Classic 2D.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Product brief (BlockForge) | "make all the games and avatars 3d" | 3D views for all 20 modules, 3D avatar rigs everywhere |

## Amendment 2026-09-26: 3D thumbnails and the mansion rebuild

- **Game thumbnails** are now rendered in 3D by `engine/thumbs3d.js`
  (`BF.thumb3d`). There is one staged scene per game id (custom games use their
  template's scene), with the title drawn on the canvas at no more than 72% of
  the width so it stays clear of the Play button. Renders are 640 × 360 JPEGs
  cached in memory and in localStorage (`bf.thumb3d.<key>`, versioned).
  `BF.thumbs.url()` returns the cached render when there is one, otherwise it
  returns the SVG and queues a render; once the render is ready, visible
  `<img>` elements are swapped in place. `g3d.World` accepts
  `opts.renderer` so the thumbnail renderer can reuse one offscreen WebGL
  context.
- **Mystery Mansion rooms** are rebuilt from a set-dressing kit (panelled
  walls, framed paintings, sconces, rugs, windows, real doors, furniture). All
  puzzle positions (furnace dials, anvil, display case) are unchanged, so
  ADR-0004's secret still works.
- `World.boxes` instances accept per-instance `rx` and `rz` rotation.

## Performance Implications

- **CPU**: about 3 ms of JS per frame in the busiest games.
- **Memory**: shared geometry and material caches; per-world resources are disposed on leave.
- **Load time**: one extra script (three.js).
- **Network**: none at runtime (vendored).

## Migration Plan

Each module gained `three: true`, a `render3d(dt)` view and a `hud(g)`
extracted from its `draw(g)`. The 2D `draw` path was kept as is.

## Validation Criteria

- e2e: all 20 games report `use3d` with a `canvas.gr-3d`; Classic 2D plays
  with the flat renderer; no page errors.
- Visual checks of each game in Low and High quality.

## Amendment (2026-09-27): template thumbnails

Creator and community games used to borrow a built-in game's key art, so
every obby looked like Sky Obby and the chosen colour barely showed.

- `thumbs3d.TEMPLATE_SCENES` now has a staged scene for each template:
  arena, racing, obby, simulator, tower defense and custom.
  - Each is themed in the game's chosen colour.
  - Each is laid out from a seed of the game id: sky, platforms, road curve,
    towers, tiles, props and camera angle.
- Title lettering now starts further right on lower lines, so the slant never
  clips it.
- Render cache version `v5`, and the cache key includes the game id.

## Amendment (2026-09-28): player camera views

Players can change the camera in any 3D game.

- **The views.** There are six:

  | View | Change to the game's own shot |
  |------|-------------------------------|
  | Classic | None (the game's own framing) |
  | Close-up | 0.62 × distance, pitch pulled 35% toward 0.62 rad |
  | Wide | 1.42 × distance |
  | Overhead | pitch 1.38 rad, 1.08 × distance |
  | Low angle | pitch pulled 80% toward 0.3 rad, 0.88 × distance |
  | Angled | yaw + 0.62 rad, 1.05 × distance |

- **One code path.** Every game camera goes through `World.look` (including
  `stage` and `side`), so the view is applied there, in `World.viewed`. No
  game module changed.
- **Transitions.** Switching views eases over a few frames (12% per 60 fps
  frame).
- **Thumbnails.** Worlds that bring their own renderer keep the game's
  framing (`userCam` false).
- **Controls.** The eye button in the game bar or the V key switches views,
  and a label shows the view's name for a moment.
- **Saving.** The choice is saved as `settings.gameplay.camera`, which
  Settings > Gameplay > Camera also sets.
- **Aiming.** Mouse aiming keeps working, because it raycasts through the
  live camera.
- **Classic 2D.** Games in Classic 2D hide the button.
- **Validation.** One e2e check, plus screenshots of every view in Block
  Battlegrounds and Skyline Racers.

### Behind the back (added the same day)

A seventh view, **Behind the back**, is a third-person chase camera. It is
implemented in `World.chase`, which runs in `render()` after the game's
`render3d`, so it overrides the game's shot.

- **Who it follows.** It follows the local player's rig: the actor `me`, or
  `me:<outfit>` in the city game.
  - The camera sits 12.5 × the rig's scale behind the player, pitched 0.24
    rad, at shoulder height, and offset over the right shoulder.
  - It looks 7 × scale ahead of the player, with a 60° field of view.
- **Swinging round.** While the player moves, the camera swings behind their
  direction of travel at 1.9 per second.
  - It uses the direction of travel, not the rig's facing, so mouse-aimed
    characters don't spin the view.
  - It never follows a move of more than 2.3 rad back toward the camera, so
    backing up doesn't flip it.
- **Where it starts.**
  - Games that frame the whole stage start facing into the map.
  - Follow-camera games start from the side their camera was already on.
  - Either way, it eases in from the game's shot over about a third of a
    second.
- **Collision.** Two rays, one from the head and one from the waist, trace
  toward the camera. The camera pulls in to the nearest solid mesh at once and
  eases back out.
  - Character rigs, see-through materials and hidden objects don't count.
  - The shoulder offset shrinks as the camera closes in.
- **Controls.** While the chase camera is active, `Input.axis()` rotates
  WASD and the joystick by the camera yaw (`input.turn`), so "up" means away
  from the camera. Right-drag orbits the camera.
- **Side-on platformers** (a low pitch and a fixed depth) chase from a
  three-quarter angle, and keep their left/right controls.
- **Games without an on-foot character** (vehicles, boards) get a low, close
  fallback shot through the normal view modifiers.
- **Handing back.** Leaving the view restores the game's camera and field of
  view.
- **Validation.**
  - One e2e check.
  - Screenshots in Dungeon Frontier, Zombie Outbreak, Sky Obby, Block
    Battlegrounds and Skyline Racers.
  - No measurable frame-rate cost from the rays (the same frame rate as
    Classic with software rendering).

## Related Decisions

ADR-0001, ADR-0003, ADR-0004 (Mansion secret unaffected), ADR-0007 (Studio levels).
