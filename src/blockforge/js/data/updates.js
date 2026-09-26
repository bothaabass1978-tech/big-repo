/**
 * BlockForge — developer updates, in release order.
 *
 * The fictional studios behind the built-in games ship these one at a time,
 * days apart (see systems/updates.js for the schedule). Each one adds a
 * changelog entry to its game and, while its event runs, can bring:
 *   xp     multiplier on XP earned in that game
 *   crowd  multiplier on the game's player count (the hype brings people in)
 *   sale   percent off that game's passes
 *   items  limited avatar items (data/items.js, `releasedBy`) that go on sale
 * When the list runs out, systems/updates.js keeps rolling smaller seasonal
 * events built from SEASONAL, just as rarely.
 */
(function (BF) {
  'use strict';

  BF.UPDATES = [
    { id: 'upd_bb_champions', gameId: 'block-battlegrounds', title: 'Champion Season',
      notes: 'Champion Season is here. Double XP and 25% off every pass for three days. The Champion Crown drops as a limited item: 600 copies, never restocked.',
      event: { xp: 2, crowd: 1.8 }, sale: 25, items: ['hat_champion_crown'] },
    { id: 'upd_mm_moonlit', gameId: 'mystery-mansion', title: 'Moonlit Manor',
      notes: 'A full moon over Ashcombe. Double XP while it lasts, hint journal fixes, and the Phantom Raven limited shoulder pet (1,200 copies).',
      event: { xp: 2, crowd: 2.4 }, sale: 20, items: ['sh_phantom_raven'] },
    { id: 'upd_sr_nightcity', gameId: 'skyline-racers', title: 'Night City Grand Prix',
      notes: 'Race weekend. 1.5x XP, 30% off passes and the Nitro Thrusters limited back item (1,500 copies). Car handling tweaks on tight corners.',
      event: { xp: 1.5, crowd: 1.7 }, sale: 30, items: ['back_nitro_thrusters'] },
    { id: 'upd_pw_parade', gameId: 'pet-world', title: 'Royal Pet Parade',
      notes: 'The parade is in town. Double XP for three days and the Royal Pet Wings limited drop (1,000 copies).',
      event: { xp: 2, crowd: 1.9 }, sale: 20, items: ['back_royal_wings'] },
    { id: 'upd_mm_deepcore', gameId: 'mega-miners', title: 'Deep Core Rush',
      notes: 'The deep layers are glowing. Double XP, 25% off passes and a limited Crystal Drone companion (350 copies).',
      event: { xp: 2, crowd: 1.8 }, sale: 25, items: ['sh_crystal_drone'] },
    { id: 'upd_cs_winter', gameId: 'castle-siege', title: 'Winter Siege',
      notes: 'Snow on the battlements. 1.5x XP, cheaper passes and the Glacier Viking Helm limited hat (700 copies).',
      event: { xp: 1.5, crowd: 1.7 }, sale: 20, items: ['hat_glacier_viking'] },
    { id: 'upd_so_cloud', gameId: 'sky-obby', title: 'Cloud Kingdom Weekend',
      notes: 'Double XP on every stage for three days and 20% off passes. Checkpoint fixes for the moving platforms.',
      event: { xp: 2, crowd: 1.9 }, sale: 20 },
    { id: 'upd_zo_bloodmoon', gameId: 'zombie-outbreak', title: 'Blood Moon',
      notes: 'The horde is restless. Double XP for three days and 25% off passes. Survivors report bigger waves.',
      event: { xp: 2, crowd: 2.1 }, sale: 25 },
    { id: 'upd_tl_legends', gameId: 'towerfall-legends', title: 'Legends Rising',
      notes: 'The biggest tower sale yet: 35% off every pass for three days, with 1.5x XP. Bots build smarter when you ask them to.',
      event: { xp: 1.5, crowd: 1.6 }, sale: 35 },
    { id: 'upd_ps_cup', gameId: 'pixel-soccer', title: 'Pixel Cup',
      notes: 'Cup week. Double XP, 20% off passes and passing fixes so your teammates actually pass back.',
      event: { xp: 2, crowd: 1.8 }, sale: 20 },
  ];

  /** Seasonal events used after the authored list runs out. */
  BF.UPDATES_SEASONAL = [
    { title: 'Weekend Blitz', notes: 'Double XP and 20% off passes for three days. Bug fixes and performance improvements.', event: { xp: 2, crowd: 1.6 }, sale: 20 },
    { title: 'Harvest Festival', notes: '1.5x XP and 25% off passes while the festival runs. Smaller fixes across the game.', event: { xp: 1.5, crowd: 1.5 }, sale: 25 },
    { title: 'Starfall Event', notes: 'Stars are falling. Double XP for three days. Stability fixes.', event: { xp: 2, crowd: 1.7 }, sale: 15 },
    { title: 'Anniversary Party', notes: 'Thank you for playing. Double XP and 30% off passes for three days.', event: { xp: 2, crowd: 1.8 }, sale: 30 },
  ];
})((window.BF = window.BF || {}));
