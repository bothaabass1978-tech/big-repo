# Nacht der Untoten (HTML5) — Module Contracts

**Hard constraint:** the shipped artifact is ONE `.html` file. No external assets, no
network, no dependencies. All art is procedurally generated to canvases at runtime;
all audio is synthesized with WebAudio; all geometry is generated in code.

Build: `node tools/build.mjs` concatenates `src/game/*.js` (lexicographic order) into
`src/shell/index.template.html` → `nacht_der_untoten.html`.

Everything is concatenated inside ONE IIFE. `Z` (declared in `00_prelude.js`) is the
shared namespace and is visible to every module. Each module file wraps itself in its
own IIFE for private scope and attaches its public surface to `Z`.

## Coordinate system & units

- Right-handed. **+X right, +Y up, +Z "south"**. Meters. Seconds.
- Yaw = rotation about +Y, 0 = looking down −Z, increasing yaw turns left.
- Pitch = rotation about the camera's right axis, positive = looking up, clamped ±89°.
- Forward vector = `(-sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))`.
- Player: eye height 1.62 m standing / 1.05 m crouched, collision radius 0.34 m.

## Module load order

| # | File | Namespace | Owner |
|---|------|-----------|-------|
| 00 | `00_prelude.js`   | `Z`, `Z.C`      | core |
| 01 | `01_math.js`      | `Z.M`           | core |
| 02 | `02_rng.js`       | `Z.RNG`         | core |
| 03 | `03_balance.js`   | `Z.B`           | economy-designer |
| 04 | `04_input.js`     | `Z.Input`       | core |
| 05 | `05_audio.js`     | `Z.Audio`       | sound-designer |
| 06 | `06_textures.js`  | `Z.Tex`         | technical-artist |
| 07 | `07_gl.js`        | `Z.GL`          | core |
| 08 | `08_mesh.js`      | `Z.Mesh`        | core |
| 09 | `09_level.js`     | `Z.Level`       | level-designer |
| 10 | `10_nav.js`       | `Z.Nav`         | ai-programmer |
| 11 | `11_phys.js`      | `Z.Phys`        | core |
| 12 | `12_render.js`    | `Z.Render`      | core |
| 13 | `13_models.js`    | `Z.Models`      | technical-artist |
| 14 | `14_fx.js`        | `Z.FX`          | core |
| 15 | `15_weapons.js`   | `Z.W`           | gameplay-programmer |
| 16 | `16_player.js`    | `Z.Player`      | gameplay-programmer |
| 17 | `17_zombie.js`    | `Z.Zombies`     | ai-programmer |
| 18 | `18_rounds.js`    | `Z.Rounds`      | ai-programmer |
| 19 | `19_econ.js`      | `Z.Econ`        | gameplay-programmer |
| 20 | `20_hud.js`       | `Z.HUD`         | ui-programmer |
| 21 | `21_menu.js`      | `Z.Menu`        | ui-programmer |
| 22 | `22_game.js`      | `Z.Game`        | core |
| 23 | `23_boot.js`      | —               | core |

**A module may only write to its own namespace.** Reading others is fine.

## Core contracts

### `Z.M` — math
`clamp(v,a,b)`, `lerp(a,b,t)`, `damp(a,b,rate,dt)`, `smoothstep(e0,e1,x)`,
`sign`, `TAU`, `DEG`, `RAD`, `angDiff(a,b)`, `angLerp(a,b,t)`,
`v3(x,y,z)` → `[x,y,z]` Float array helpers: `add,sub,mul,scale,dot,cross,len,dist,dist2,norm,copy,set,lerp3`,
`m4` (Float32Array(16)): `ident,persp,ortho,lookAt,mul,translate,rotX,rotY,rotZ,scale,invert,transpose,transformPoint,transformDir`.

### `Z.RNG`
`Z.RNG.make(seed)` → `{ f(), i(n), range(a,b), pick(arr), shuffle(arr), gauss() }` (deterministic xorshift128).
`Z.RNG.global` — the game's shared stream (reseeded per run).

### `Z.Input`
`init(canvasEl)`, `update()` (call once per frame BEFORE sim), `postUpdate()` (clears edges),
`down(code)`, `pressed(code)`, `released(code)`, `mb(n)`, `mbPressed(n)`,
`takeMouse()` → `{dx,dy}` (accumulated raw deltas, consumed), `wheel()`,
`lock()`, `locked` (bool), `axis(neg,pos)`, `gamepad` (nullable snapshot).
Key codes are `KeyboardEvent.code` strings (`"KeyW"`, `"Space"`, `"ShiftLeft"`…).

### `Z.Phys`
- `Z.Phys.setLevel(level)`
- `move(ent, dt)` — `ent = {pos:[x,y,z], vel:[x,y,z], radius, height, onGround, stepUp}`.
  Swept AABB-vs-brush collide-and-slide with 0.45 m step-up and gravity.
- `raycast(origin, dir, maxDist, mask)` → `{hit, t, point:[3], normal:[3], brush}` or `null`.
- `losClear(a, b)` → bool (world geometry only).
- `pointSolid(p)`, `capsuleSolid(p, r, h)`.

### `Z.GL`
`init(canvas)` → `gl` (WebGL2, falls back to WebGL1), `Z.GL.gl`,
`prog(vsSrc, fsSrc, attribNames)` → `{p, u:{}, a:{}}`, `buf(data, target)`,
`tex2D(canvasOrImageData, opts)`, `texFromFn(size, fn)`, `resize()`, `Z.GL.W`, `Z.GL.H`, `Z.GL.aspect`.

## Data contracts (what parallel agents must honour)

### Brush (level geometry primitive) — produced by `Z.Level`
```js
{ min:[x,y,z], max:[x,y,z],       // AABB in world meters
  mat:"wood_wall",                 // key into Z.Tex materials
  solid:true,                      // participates in collision
  faces:0b111111,                  // optional face cull mask +X,-X,+Y,-Y,+Z,-Z
  uvScale:1, tint:[1,1,1], group:"floor1" }
```
Non-axis-aligned geometry (stairs, rubble, railings) is expressed as many small brushes
or as an explicit `mesh` entry — see `Z.Level.meshes`.

### `Z.Level.build()` → level object
```js
{ brushes:[Brush], meshes:[{verts,norms,uvs,mat}],
  windows:[Window], buys:[Buy], perkSpots:[PerkSpot], boxSpots:[[x,y,z,yaw]],
  spawnZones:[{pos:[3], windowId}], playerStart:{pos:[3], yaw},
  bounds:{min:[3],max:[3]}, navSeeds:[[x,y,z]], lights:[{pos,color,radius,flicker}] }
```

### Window (barricade) — the heart of the game
```js
{ id, pos:[3],            // centre of the window opening
  normal:[3],             // points INTO the building
  out:[3],                // outside standing spot for zombies queueing
  inPos:[3],              // inside drop point after climbing through
  boards:6,               // 0..6 present planks
  repairFrom:[3],         // where the player must stand to repair
  room:"ground_main" }
```

### Buy (wall weapon / debris / door)
```js
{ kind:"weapon"|"debris"|"ammo", id:"kar98k", cost:500,
  pos:[3], yaw, room:"…", opens:["room_id"], // debris only
  hint:"Press F to buy Kar98k [500]" }
```

## Balance (`Z.B`) — the single source of truth for numbers
`Z.B` is pure data + pure functions. No side effects, no DOM, no globals.
Required exports: `roundHealth(r)`, `roundZombieCount(r, players)`, `maxAlive(players)`,
`spawnDelay(r)`, `zombieSpeedTier(r)`, `POINTS`, `PRICES`, `WEAPONS`, `PERKS`,
`POWERUP_CHANCE`, `MAX_POWERUPS_PER_ROUND`.

## Audio (`Z.Audio`)
`init()` (must be called from a user gesture), `ready` bool,
`play(name, opts)` → voice handle; `opts = {pos:[3], vol, rate, delay}`,
`loop(name, opts)` → handle with `.stop()`, `.set(param,value)`,
`listener(pos, forward, up)`, `setMasterVolume(v)`, `duck(amount, seconds)`,
`suspend()`, `resume()`, `Z.Audio.NAMES` (array of every sound id).
Positional audio uses PannerNode. Everything synthesized — zero sample assets.

## Textures (`Z.Tex`)
`build()` — generate all canvases (called once at boot, may take ~100 ms),
`Z.Tex.materials` → `{ [key]: {canvas, tile:[u,v], normalCanvas?, spec, emissive} }`,
`get(key)` → material, `Z.Tex.KEYS` array.
Textures must be power-of-two, seamless-tiling, and use `Z.RNG.make(fixedSeed)` so
the look is deterministic build-to-build.

### `Z.Models`
`build()` → `{ zombie:{…skinned mesh…}, guns:{ [weaponId]: mesh }, props:{…} }`
Zombie is a low-poly rig with named joints: `root, spine, head, armL, armR, legL, legR,
foreArmL, foreArmR, shinL, shinR`. `Z.Models.poseZombie(rig, anim, t, out)` fills a
Float32Array of joint matrices.

## HUD (`Z.HUD`)
Draws to the 2D `#hud` canvas only. `init(canvas)`, `resize(w,h)`,
`draw(ctx, state, dt)` where `state` is the read-only snapshot published by `Z.Game.hudState()`.
The HUD must never mutate game state.

## Verification harness

`node tools/harness/run.mjs <scenario>` launches the built HTML in headless Chromium and
drives `window.__Z` directly. Scenarios live in `tools/harness/scenarios/`.
`window.__Z.debug` exposes: `sim(seconds)`, `giveWeapon(id)`, `setRound(n)`,
`teleport(x,y,z)`, `stats()`, `screenshotState()`, `botPlay(seconds)`.

## Mesh format (used by `Z.Level.meshes`, `Z.Models`, `Z.Render`)
```js
{ verts: Float32Array,   // xyz per vertex
  norms: Float32Array,   // xyz per vertex
  uvs:   Float32Array,   // uv per vertex
  cols:  Float32Array,   // rgb per vertex (baked AO / tint), optional -> defaults to white
  joint: Uint8Array,     // one joint index per vertex (skinned meshes only)
  idx:   Uint16Array,    // triangle indices
  mat:   "material_key" }
```
Helper: `Z.Mesh.builder()` → `{ vert(p,n,uv,col,joint), tri(a,b,c), quad(a,b,c,d),
box(min,max,mat,opts), cyl(...), finish(mat) }`.

## `Z.Game.hudState()` snapshot (read-only; HUD/menu consume this)
```js
{ mode:"boot"|"menu"|"playing"|"paused"|"downed"|"gameover",
  round:1, roundPhase:"intro"|"active"|"between", roundTimer:0,
  points:500, pointsDelta:[{v:60,t:0.4,crit:false}],
  health:100, maxHealth:100, damageDir:[{ang:1.2,t:0.6}], lowHealth:false,
  weapon:{ id:"m1911", name:"M1911", mag:8, magSize:8, reserve:32, reloading:false,
           firemode:"semi", ads:0 },
  weapons:[{id,name,mag,reserve}], slot:0,
  grenades:2, perks:["jugg","speed"], powerups:[{id:"instakill",t:12.4}],
  prompt:{ text:"Press F to buy Kar98k [200]", cost:200, affordable:true } | null,
  hitmarker:{t:0, crit:false}, crosshairSpread:0.12,
  zombiesAlive:7, zombiesRemaining:12, kills:34, headshots:12, downs:0,
  stats:{ shotsFired, hits, accuracy, timeAlive },
  fps:60, screen:{ blood:0.3, flash:0.0, fade:0.0 } }
```
