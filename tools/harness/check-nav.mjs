// Validates the navigation graph: coverage, connectivity, window links, perf.
import { loadModules } from './load.mjs';
const Z = loadModules(['00_prelude.js','01_math.js','02_rng.js','08_mesh.js',
  '09_level.js','10_nav.js','11_phys.js']);
const lv = Z.Level.build();
lv.navBounds = { min: [-20, 0, -18], max: [20, 0, 18] };
Z.Phys.setLevel(lv);
let fail = 0; const bad = (m)=>{console.log('  FAIL '+m); fail++;};

Z.Nav.build(lv);
console.log('nav:', JSON.stringify(Z.Nav.debugDump().byRoom), 'total', Z.Nav.nodeCount(),
  'edges', Z.Nav.stats.edges, 'buildMs', Z.Nav.buildMs.toFixed(1));
if (Z.Nav.stats.windowLinks !== lv.windows.length) bad('only '+Z.Nav.stats.windowLinks+'/'+lv.windows.length+' windows linked');

// Every window must be reachable from its spawn zones (outside pathing).
for (const sz of lv.spawnZones) {
  const w = lv.windows.find(x=>x.id===sz.windowId);
  const p = Z.Nav.pathBetween(sz.pos, w.out);
  if (!p) bad('no outside path from spawn zone to window '+w.id);
}
// From every window's inside drop point, a zombie must be able to reach the player.
const ps = lv.playerStart.pos;
for (const w of lv.windows) {
  if (w.floorY !== 0) continue;
  const p = Z.Nav.pathBetween([w.inPos[0], w.floorY+0.05, w.inPos[2]], ps);
  if (!p) bad('no inside path from window '+w.id+' to player start');
}
// Upper windows: after debris the upstairs is connected; before, upper zombies
// must still be able to come down (they drop through the holes).
Z.Level.removeDebris('stairs_west'); Z.Level.removeDebris('stairs_east');
Z.Phys.setLevel(lv); Z.Nav.build(lv);
for (const w of lv.windows) {
  const p = Z.Nav.pathBetween([w.inPos[0], w.floorY+0.05, w.inPos[2]], ps);
  if (!p) bad('post-debris: no path from window '+w.id+' to player start');
}
// perf
const t0=Date.now(); let n=0;
for (let i=0;i<400;i++){
  const a = lv.windows[i%lv.windows.length];
  const p = Z.Nav.pathBetween([a.inPos[0],a.floorY+0.05,a.inPos[2]], ps);
  if(p) n+=p.length;
}
const ms=(Date.now()-t0)/400;
console.log('400 paths, avg '+ms.toFixed(3)+'ms, avg len '+(n/400).toFixed(1));
if (ms > 2.0) bad('A* too slow: '+ms.toFixed(2)+'ms per path');
console.log(fail? '\nNAV CHECK: '+fail+' FAILURES' : '\nNAV CHECK: PASS');
process.exit(fail?1:0);
