/**
 * BlockForge — avatar item catalog, rarity tiers and categories (data only).
 * `look` holds render parameters consumed by BF.avatar (systems/avatar.js).
 */
(function (BF) {
  'use strict';

  /** Rarity tiers: presentation colour, sort rank and collection-value multiplier. */
  BF.RARITY = {
    common: { key: 'common', label: 'Common', color: '#9aa5b5', rank: 0, valueMult: 1.0 },
    uncommon: { key: 'uncommon', label: 'Uncommon', color: '#4ad17f', rank: 1, valueMult: 1.1 },
    rare: { key: 'rare', label: 'Rare', color: '#46a8ff', rank: 2, valueMult: 1.25 },
    epic: { key: 'epic', label: 'Epic', color: '#b67cff', rank: 3, valueMult: 1.5 },
    legendary: { key: 'legendary', label: 'Legendary', color: '#ffb52e', rank: 4, valueMult: 2.0 },
    mythic: { key: 'mythic', label: 'Mythic', color: '#ff4f9a', rank: 5, valueMult: 3.0 },
    exotic: { key: 'exotic', label: 'Exotic', color: '#39f3ff', rank: 6, valueMult: 4.0 },
    divine: { key: 'divine', label: 'Divine', color: '#fff1a8', rank: 7, valueMult: 6.0 },
  };
  BF.RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'divine'];

  /**
   * Item categories. `slot` = avatar slot it equips into; `group` = shop tab / inventory tab.
   */
  BF.ITEM_CATS = {
    head: { label: 'Head', slot: 'head', group: 'avatar', icon: 'user' },
    face: { label: 'Face', slot: 'face', group: 'avatar', icon: 'smile' },
    hair: { label: 'Hair', slot: 'hair', group: 'avatar', icon: 'user' },
    shirt: { label: 'Shirt', slot: 'shirt', group: 'clothing', icon: 'shirt' },
    pants: { label: 'Pants', slot: 'pants', group: 'clothing', icon: 'shirt' },
    jacket: { label: 'Jacket', slot: 'jacket', group: 'clothing', icon: 'shirt' },
    shoes: { label: 'Shoes', slot: 'shoes', group: 'clothing', icon: 'run' },
    hat: { label: 'Hat', slot: 'hat', group: 'accessories', icon: 'hat' },
    back: { label: 'Back', slot: 'back', group: 'accessories', icon: 'layers' },
    neck: { label: 'Neck', slot: 'neck', group: 'accessories', icon: 'medal' },
    shoulder: { label: 'Shoulder', slot: 'shoulder', group: 'accessories', icon: 'paw' },
    accessory: { label: 'Accessory', slot: 'accessory', group: 'accessories', icon: 'eye' },
    emote: { label: 'Emote', slot: 'emote', group: 'emotes', icon: 'emote' },
    animation: { label: 'Animation', slot: 'animation', group: 'animations', icon: 'run' },
    bundle: { label: 'Bundle', slot: null, group: 'bundles', icon: 'gift' },
    collectible: { label: 'Collectible', slot: null, group: 'collectibles', icon: 'gem' },
    tool: { label: 'Tool', slot: null, group: 'tools', icon: 'wrench' },
  };

  /** Avatar slots in render/editor order. */
  BF.AVATAR_SLOTS = ['head', 'face', 'hair', 'shirt', 'pants', 'jacket', 'shoes', 'hat', 'back', 'neck', 'shoulder', 'accessory', 'emote', 'animation'];
  /** Slots that must always hold something (fall back to starter item). */
  BF.REQUIRED_SLOTS = { head: 'head_block', face: 'face_smile', shirt: 'shirt_forge', pants: 'pants_denim', animation: 'anim_default' };

  BF.SKIN_TONES = ['#f7d7b5', '#f1c27d', '#e0ac69', '#c68642', '#a86b3c', '#8d5524', '#5c3a21', '#ffd23f', '#9be7a0', '#8fd3ff', '#c9b6ff', '#ff9aa2', '#d7dde6', '#6b7280'];

  // [id, name, cat, rarity, price, creator, desc, look, extra]
  const RAW = [
    // ---- Head
    ['head_block', 'Classic Block Head', 'head', 'common', 0, 'BlockForge', 'The original. Crisp corners, endless possibilities.', { shape: 'block' }, { starter: true }],
    ['head_round', 'Round Head', 'head', 'common', 75, 'PixelSmiths', 'A softer silhouette for the easygoing forger.', { shape: 'round' }],
    ['head_pumpkin', 'Pumpkin Noggin', 'head', 'uncommon', 260, 'Moonloom', 'Freshly carved every October. Smells faintly of pie.', { shape: 'pumpkin', c1: '#ff8c1a' }],
    ['head_robo', 'Robo Head', 'head', 'rare', 480, 'Gearhead Garage', 'Brushed alloy with a blinking antenna.', { shape: 'robot', c1: '#aab6c8' }],
    ['head_crystal', 'Crystal Head', 'head', 'epic', 1400, 'NeonAtelier', 'A faceted head grown in the Crystal Caves.', { shape: 'crystal', c1: '#7fe7ff' }],
    ['head_void', 'Void Head', 'head', 'mythic', 9000, 'NeonAtelier', 'A pocket of starlit nothing where a head should be.', { shape: 'void', c1: '#140b26', c2: '#b67cff' }, { featured: true }],
    // ---- Face
    ['face_smile', 'Friendly Smile', 'face', 'common', 0, 'BlockForge', 'Ready for anything.', { style: 'smile' }, { starter: true }],
    ['face_grin', 'Big Grin', 'face', 'common', 60, 'PixelSmiths', 'All teeth, all joy.', { style: 'grin' }],
    ['face_wink', 'Winky', 'face', 'common', 80, 'PixelSmiths', 'You know something they do not.', { style: 'wink' }],
    ['face_sleepy', 'Sleepy', 'face', 'common', 90, 'Moonloom', 'Five more minutes. Then one more round.', { style: 'sleepy' }],
    ['face_determined', 'Determined', 'face', 'uncommon', 150, 'IronAnvil Studios', 'Eyes on the leaderboard.', { style: 'determined' }],
    ['face_robot', 'Circuit Face', 'face', 'rare', 380, 'Gearhead Garage', 'LED eyes with a scrolling grin.', { style: 'robot' }],
    ['face_star', 'Star Struck', 'face', 'rare', 420, 'NeonAtelier', 'Starry eyes for starry skies.', { style: 'star' }],
    ['face_fangs', 'Night Fangs', 'face', 'epic', 950, 'Moonloom', 'Tiny fangs, big attitude.', { style: 'fangs' }],
    // ---- Hair
    ['hair_tidy', 'Tidy Brown Hair', 'hair', 'common', 0, 'BlockForge', 'Neat, dependable, classic.', { style: 'short', c1: '#6b4226' }, { starter: true }],
    ['hair_bun', 'Mint Bun', 'hair', 'common', 120, 'StitchWorks', 'A cool mint top-knot.', { style: 'bun', c1: '#66e0b8' }],
    ['hair_curls', 'Cloud Curls', 'hair', 'uncommon', 200, 'StitchWorks', 'Fluffy curls as white as cumulus.', { style: 'curly', c1: '#f1ede4' }],
    ['hair_spiky', 'Spiky Ember Hair', 'hair', 'uncommon', 220, 'IronAnvil Studios', 'Styled with forge heat.', { style: 'spiky', c1: '#ff7a2e' }],
    ['hair_long', 'Midnight Long Hair', 'hair', 'uncommon', 240, 'Moonloom', 'Flows like a night river.', { style: 'long', c1: '#23304f' }],
    ['hair_ponytail', 'Sunset Ponytail', 'hair', 'rare', 450, 'StitchWorks', 'Orange-to-gold, like the last minute of daylight.', { style: 'ponytail', c1: '#ff9a3c' }],
    ['hair_mohawk', 'Neon Mohawk', 'hair', 'rare', 520, 'NeonAtelier', 'Glows under blacklight. And daylight.', { style: 'mohawk', c1: '#ff4fd8' }],
    // ---- Shirt
    ['shirt_forge', 'Forge Tee', 'shirt', 'common', 0, 'BlockForge', 'Teal cotton stamped with the ember chevron.', { style: 'logo', c1: '#23a699', c2: '#ffb454' }, { starter: true }],
    ['shirt_stripe', 'Striped Tee', 'shirt', 'common', 80, 'StitchWorks', 'Sailor stripes for landlubbers.', { style: 'stripe', c1: '#eef1f6', c2: '#3d6eff' }],
    ['shirt_hoodie', 'Cozy Hoodie', 'shirt', 'common', 150, 'StitchWorks', 'Warm, soft and pocketed.', { style: 'hoodie', c1: '#5b6b82', c2: '#46546a' }, { starterOwned: true }],
    ['shirt_tropical', 'Tropical Shirt', 'shirt', 'uncommon', 180, 'Harborline Goods', 'Hibiscus season, all year.', { style: 'tropical', c1: '#ff6f61', c2: '#ffe66d' }],
    ['shirt_jersey', 'Team Jersey', 'shirt', 'uncommon', 200, 'Kickoff Club', 'Number 7, always.', { style: 'jersey', c1: '#1d4ed8', c2: '#f8fafc' }],
    ['shirt_tux', 'Tuxedo Shirt', 'shirt', 'rare', 500, 'StitchWorks', 'For formal occasions and boss fights.', { style: 'tux', c1: '#141821', c2: '#f8fafc' }],
    ['shirt_knight', 'Knight Chestplate', 'shirt', 'epic', 1100, 'IronAnvil Studios', 'Hammered steel with a crest of the old guard.', { style: 'armor', c1: '#b8c2cf', c2: '#6b7a8f' }],
    ['shirt_galaxy', 'Galaxy Tee', 'shirt', 'legendary', 2800, 'NeonAtelier', 'An entire nebula, machine washable.', { style: 'galaxy', c1: '#1b1446', c2: '#b67cff' }, { featured: true }],
    // ---- Pants
    ['pants_denim', 'Denim Jeans', 'pants', 'common', 0, 'BlockForge', 'A trusty pair that goes with everything.', { style: 'jeans', c1: '#2f4a7a' }, { starter: true }],
    ['pants_shorts', 'Summer Shorts', 'pants', 'common', 70, 'Harborline Goods', 'Sand not included.', { style: 'shorts', c1: '#f59e0b' }],
    ['pants_cargo', 'Cargo Pants', 'pants', 'common', 100, 'StitchWorks', 'Pockets for your pockets.', { style: 'cargo', c1: '#5b6b3a' }],
    ['pants_track', 'Track Pants', 'pants', 'common', 110, 'Kickoff Club', 'Built for sprinting between servers.', { style: 'track', c1: '#22262e', c2: '#ff7a2e' }],
    ['pants_neon', 'Neon Joggers', 'pants', 'rare', 460, 'NeonAtelier', 'Piping that hums in the dark.', { style: 'track', c1: '#101826', c2: '#39f3ff' }],
    ['pants_knight', 'Knight Greaves', 'pants', 'epic', 900, 'IronAnvil Studios', 'Clanky, but in a heroic way.', { style: 'armor', c1: '#aab4c2', c2: '#5d6b80' }],
    // ---- Jacket
    ['jacket_lab', 'Lab Coat', 'jacket', 'uncommon', 300, 'Gearhead Garage', 'For science. Mostly explosive science.', { style: 'lab', c1: '#eef2f7', c2: '#c7d0db' }],
    ['jacket_puffer', 'Puffer Jacket', 'jacket', 'uncommon', 350, 'StitchWorks', 'Puffy enough to bounce off walls.', { style: 'puffer', c1: '#e03e5a', c2: '#b82d46' }],
    ['jacket_bomber', 'Bomber Jacket', 'jacket', 'rare', 600, 'Harborline Goods', 'Olive shell, ember lining.', { style: 'bomber', c1: '#3f5a3a', c2: '#ff9d3c' }],
    ['jacket_leather', 'Leather Jacket', 'jacket', 'rare', 700, 'StitchWorks', 'Scuffed in all the right places.', { style: 'leather', c1: '#1c1c22', c2: '#3a3a46' }],
    ['jacket_circuit', 'Circuit Vest', 'jacket', 'epic', 1500, 'NeonAtelier', 'Traces of light run along every seam.', { style: 'vest', c1: '#0f1a24', c2: '#39f3ff' }],
    // ---- Shoes
    ['shoes_sneakers', 'Basic Sneakers', 'shoes', 'common', 0, 'BlockForge', 'Fresh out of the box.', { style: 'sneaker', c1: '#e8ecf1', c2: '#ff7a2e' }, { starter: true }],
    ['shoes_slippers', 'Cozy Slippers', 'shoes', 'common', 60, 'Moonloom', 'Maximum comfort, minimum traction.', { style: 'slipper', c1: '#f7a8c4' }],
    ['shoes_hightop', 'High-Tops', 'shoes', 'common', 120, 'Kickoff Club', 'Laced to the ankle.', { style: 'hightop', c1: '#d63d3d', c2: '#ffffff' }],
    ['shoes_boots', 'Adventure Boots', 'shoes', 'uncommon', 200, 'Harborline Goods', 'Broken in on a hundred islands.', { style: 'boot', c1: '#7a4a2a', c2: '#4b2e1a' }],
    ['shoes_rocket', 'Rocket Boots', 'shoes', 'legendary', 3200, 'Gearhead Garage', 'Thrusters sold separately. Just kidding, they are included.', { style: 'rocket', c1: '#c0c8d4', c2: '#ff7a2e' }, { featured: true }],
    // ---- Hat
    ['hat_retro', 'Retro Cap', 'hat', 'common', 90, 'BlockForge', 'Ember-orange cap with a white brim.', { style: 'cap', c1: '#ff7a2e', c2: '#ffffff' }, { starterOwned: true }],
    ['hat_beanie', 'Cozy Beanie', 'hat', 'common', 80, 'StitchWorks', 'Knitted by a very patient grandma bot.', { style: 'beanie', c1: '#3aa0ff', c2: '#e8f3ff' }],
    ['hat_bunny', 'Bunny Ears', 'hat', 'uncommon', 180, 'Tinytails Co.', 'Hop to it.', { style: 'ears', c1: '#f8f8fb', c2: '#ffb6c9' }],
    ['hat_explorer', 'Explorer Hat', 'hat', 'uncommon', 260, 'Harborline Goods', 'Wide brim, leather band, many stories.', { style: 'explorer', c1: '#c8a46a', c2: '#6b4f2a' }],
    ['hat_headphones', 'Beat Headphones', 'hat', 'uncommon', 300, 'NeonAtelier', 'Your own soundtrack, always.', { style: 'headphones', c1: '#23262e', c2: '#ff4f9a' }],
    ['hat_storm', 'Storm Hood', 'hat', 'rare', 550, 'Moonloom', 'Crackles faintly before a thunderstorm.', { style: 'hood', c1: '#34405a', c2: '#7ad0ff' }],
    ['hat_wizard', 'Wizard Hat', 'hat', 'rare', 650, 'Moonloom', 'Pointy. Mysterious. Slightly singed.', { style: 'wizard', c1: '#4b2a8a', c2: '#ffd23f' }],
    ['hat_blockcrown', 'Block Crown', 'hat', 'rare', 700, 'PixelSmiths', 'A crown of stacked steel blocks with sapphire studs.', { style: 'blockcrown', c1: '#c0c8d4', c2: '#46a8ff' }],
    ['hat_viking', 'Viking Helm', 'hat', 'epic', 1300, 'IronAnvil Studios', 'Horned, dented and proud of it.', { style: 'viking', c1: '#9aa5b5', c2: '#f3e2c0' }],
    ['hat_horns', 'Golden Horns', 'hat', 'epic', 1800, 'IronAnvil Studios', 'Polished to a mischievous shine.', { style: 'horns', c1: '#ffc940', c2: '#b8860b' }],
    ['hat_galaxy', 'Galaxy Helmet', 'hat', 'legendary', 3800, 'NeonAtelier', 'A visor full of drifting stars.', { style: 'helmet', c1: '#1b1446', c2: '#8fd3ff' }],
    ['hat_pixelcrown', 'Pixel Crown', 'hat', 'legendary', 4500, 'PixelSmiths', 'Eight bits of royalty.', { style: 'crown', c1: '#ffd23f', c2: '#ff4f9a' }, { featured: true }],
    ['hat_firehalo', 'Fire Halo', 'hat', 'mythic', 12000, 'IronAnvil Studios', 'A ring of living forge-flame. Warm to the touch.', { style: 'halo', c1: '#ff7a2e', c2: '#ffe066' }, { featured: true }],
    // ---- Back
    ['back_shell', 'Turtle Shell', 'back', 'common', 150, 'Tinytails Co.', 'Slow and steady wins the obby.', { style: 'shell', c1: '#4f8a3c', c2: '#8cc56b' }],
    ['back_sheath', 'Sword Sheath', 'back', 'uncommon', 280, 'IronAnvil Studios', 'Ornamental. Probably.', { style: 'sword', c1: '#8b5a2b', c2: '#cfd6df' }],
    ['back_cape', 'Hero Cape', 'back', 'rare', 600, 'StitchWorks', 'Billows dramatically even indoors.', { style: 'cape', c1: '#d62839', c2: '#ffd23f' }],
    ['back_cyber', 'Cyber Backpack', 'back', 'rare', 750, 'NeonAtelier', 'Charges your gear with glowing cells.', { style: 'backpack', c1: '#16202c', c2: '#39f3ff' }],
    ['back_wings', 'Angel Wings', 'back', 'epic', 2200, 'Moonloom', 'Feathered and soft as clouds.', { style: 'wings', c1: '#ffffff', c2: '#dfe7f2' }],
    ['back_jetpack', 'Jet Pack', 'back', 'legendary', 4200, 'Gearhead Garage', 'Twin boosters with an ember exhaust.', { style: 'jetpack', c1: '#9aa5b5', c2: '#ff7a2e' }],
    ['back_emberwings', 'Ember Wings', 'back', 'mythic', 11000, 'IronAnvil Studios', 'Wings hammered from sparks at the heart of the forge.', { style: 'wings', c1: '#ff7a2e', c2: '#ffd23f', glow: true }],
    // ---- Neck
    ['neck_bandana', 'Bandana', 'neck', 'common', 60, 'Harborline Goods', 'Classic paisley, windswept.', { style: 'bandana', c1: '#2f6fe0' }],
    ['neck_scarf', 'Cozy Scarf', 'neck', 'common', 70, 'StitchWorks', 'Candy-cane stripes.', { style: 'scarf', c1: '#d33f49', c2: '#f3f3f3' }, { starterOwned: true }],
    ['neck_bowtie', 'Dapper Bowtie', 'neck', 'common', 90, 'StitchWorks', 'Instantly 30% fancier.', { style: 'bowtie', c1: '#c81d4e' }],
    ['neck_chain', 'Gold Chain', 'neck', 'rare', 700, 'PixelSmiths', 'Chunky links. Chunky flex.', { style: 'chain', c1: '#ffc940' }],
    ['neck_medal', 'Champion Medal', 'neck', 'epic', 1500, 'Kickoff Club', 'Awarded for winning. Or buying. We will not tell.', { style: 'medal', c1: '#ffc940', c2: '#1d4ed8' }],
    // ---- Shoulder (pets and gear)
    ['sh_pads', 'Spiked Pads', 'shoulder', 'uncommon', 250, 'IronAnvil Studios', 'Intimidating in every lobby.', { style: 'pads', c1: '#3a3f4b', c2: '#cfd6df' }],
    ['sh_kitty', 'Pixel Kitty', 'shoulder', 'uncommon', 350, 'Tinytails Co.', 'A tiny cat that naps on your shoulder.', { style: 'cat', c1: '#f4a261', c2: '#ffffff' }, { pet: true }],
    ['sh_parrot', 'Parrot Buddy', 'shoulder', 'rare', 800, 'Harborline Goods', 'Repeats your chat messages. Loudly.', { style: 'bird', c1: '#2ec27e', c2: '#ff4f4f' }, { pet: true }],
    ['sh_drone', 'Hover Drone', 'shoulder', 'rare', 900, 'Gearhead Garage', 'A loyal little quadcopter.', { style: 'drone', c1: '#9aa5b5', c2: '#39f3ff' }],
    ['sh_fox', 'Ember Fox Pal', 'shoulder', 'epic', 1600, 'Tinytails Co.', 'A fox kit with a glowing tail.', { style: 'fox', c1: '#ff7a2e', c2: '#ffffff' }, { pet: true }],
    ['sh_dragon', 'Baby Dragon', 'shoulder', 'legendary', 5000, 'Tinytails Co.', 'Sneezes tiny sparks.', { style: 'dragon', c1: '#7c3aed', c2: '#ffd23f' }, { pet: true, featured: true }],
    // ---- Accessory
    ['acc_glasses', 'Nerd Glasses', 'accessory', 'common', 80, 'PixelSmiths', 'Thick frames, sharp mind.', { style: 'glasses', c1: '#1f2430' }, { starterOwned: true }],
    ['acc_monocle', 'Monocle', 'accessory', 'uncommon', 180, 'StitchWorks', 'Quite so.', { style: 'monocle', c1: '#ffc940' }],
    ['acc_starshades', 'Star Shades', 'accessory', 'uncommon', 220, 'NeonAtelier', 'Star-shaped and extremely cool.', { style: 'starshades', c1: '#ff4f9a' }],
    ['acc_goggles', 'Aviator Goggles', 'accessory', 'rare', 480, 'Harborline Goods', 'For the open sky.', { style: 'goggles', c1: '#7a4a2a', c2: '#8fd3ff' }],
    ['acc_visor', 'Neon Visor', 'accessory', 'rare', 650, 'NeonAtelier', 'Cyan light bar across the eyes.', { style: 'visor', c1: '#39f3ff' }],
    ['acc_mask', 'Shadow Mask', 'accessory', 'epic', 1200, 'Moonloom', 'Nobody knows who wears it. Not even you.', { style: 'mask', c1: '#15151c', c2: '#b67cff' }],
    // ---- Emotes
    ['emote_wave', 'Wave', 'emote', 'common', 0, 'BlockForge', 'Hello, world.', { anim: 'wave' }, { starter: true }],
    ['emote_salute', 'Salute', 'emote', 'common', 80, 'IronAnvil Studios', 'Respect the squad.', { anim: 'salute' }],
    ['emote_laugh', 'Laugh', 'emote', 'common', 90, 'PixelSmiths', 'Ha. Ha. Ha.', { anim: 'laugh' }],
    ['emote_cheer', 'Cheer', 'emote', 'common', 100, 'Kickoff Club', 'Pom-poms optional.', { anim: 'cheer' }],
    ['emote_spin', 'Victory Spin', 'emote', 'common', 120, 'Kickoff Club', 'Spin to win.', { anim: 'spin' }],
    ['emote_flex', 'Flex', 'emote', 'uncommon', 180, 'IronAnvil Studios', 'Show off those block biceps.', { anim: 'flex' }],
    ['emote_dance', 'Dance Party', 'emote', 'uncommon', 200, 'NeonAtelier', 'Bring the whole server.', { anim: 'dance' }],
    ['emote_jacks', 'Jumping Jacks', 'emote', 'rare', 400, 'Kickoff Club', 'Cardio between rounds.', { anim: 'jacks' }],
    ['emote_robot', 'Robot Dance', 'emote', 'rare', 450, 'Gearhead Garage', 'Beep. Boop. Groove.', { anim: 'robot' }],
    ['emote_meteor', 'Meteor Drop', 'emote', 'legendary', 2500, 'Starlit Arcade', 'Leap up. Come down like a comet.', { anim: 'meteor' }],
    // ---- Animation packs
    ['anim_default', 'Standard Animation', 'animation', 'common', 0, 'BlockForge', 'The classic idle bob.', { anim: 'idle' }, { starter: true }],
    ['anim_bouncy', 'Bouncy Pack', 'animation', 'uncommon', 350, 'Tinytails Co.', 'Everything is springier.', { anim: 'bouncy' }],
    ['anim_robot', 'Robot Pack', 'animation', 'uncommon', 400, 'Gearhead Garage', 'Precise, mechanical, tick-tock.', { anim: 'robotic' }],
    ['anim_ninja', 'Ninja Pack', 'animation', 'rare', 750, 'Moonloom', 'Low stance, ready to vanish.', { anim: 'ninja' }],
    ['anim_floaty', 'Floaty Pack', 'animation', 'epic', 1200, 'NeonAtelier', 'Gravity is merely a suggestion.', { anim: 'float' }],
    ['anim_hero', 'Hero Pack', 'animation', 'legendary', 2600, 'IronAnvil Studios', 'Chest out. Chin up. Cape optional.', { anim: 'hero' }],
    // ---- Collectibles (non-wearable)
    ['col_founders_anvil', "Founder's Anvil", 'collectible', 'mythic', 15000, 'BlockForge', 'A tiny golden anvil minted for the first forgers. Limited to one per account.', { icon: 'anvil', c1: '#ffc940' }, { featured: true, limited: 1 }],
    ['col_doubloon', 'Ancient Doubloon', 'collectible', 'rare', 0, 'Salty Pixel Co.', 'Dug up on the Treasure Islands. Still shiny.', { icon: 'coin', c1: '#ffc940' }, { notForSale: true, value: 400, gameId: 'treasure-islands' }],
    ['col_ruby_shell', 'Ruby Shell', 'collectible', 'uncommon', 0, 'Salty Pixel Co.', 'A shell the color of sunset.', { icon: 'shell', c1: '#ff5a6a' }, { notForSale: true, value: 150, gameId: 'treasure-islands' }],
    ['col_moon_pearl', 'Moon Pearl', 'collectible', 'epic', 0, 'Salty Pixel Co.', 'Glows softly on full-moon nights.', { icon: 'pearl', c1: '#dfe7ff' }, { notForSale: true, value: 900, gameId: 'treasure-islands' }],
    ['col_core_crystal', 'Core Crystal', 'collectible', 'legendary', 0, 'DeepCore Games', 'Mined from the very bottom of Mega Miners.', { icon: 'gem', c1: '#ff4fd8' }, { notForSale: true, value: 2500, gameId: 'mega-miners' }],
    ['col_golden_beetle', 'Golden Beetle', 'collectible', 'rare', 0, 'Old Harrow Games', 'Found hiding in Ashcombe Manor.', { icon: 'beetle', c1: '#ffc940' }, { notForSale: true, value: 350, gameId: 'mystery-mansion' }],
    ['col_brass_key', 'Ashcombe Brass Key', 'collectible', 'epic', 0, 'Old Harrow Games', 'Proof that you cracked the Ashcombe case.', { icon: 'key', c1: '#d8a64b' }, { notForSale: true, value: 800, gameId: 'mystery-mansion' }],
    ['col_chequered_plate', 'Chequered Plate', 'collectible', 'rare', 0, 'Nitro Nest', 'Awarded for a first-place finish in Skyline Racers.', { icon: 'flag', c1: '#f5f5f5' }, { notForSale: true, value: 300, gameId: 'skyline-racers' }],
    ['col_arena_trophy', 'Arena Trophy', 'collectible', 'epic', 0, 'IronAnvil Studios', 'Victor of a Block Battlegrounds match.', { icon: 'trophy', c1: '#ffc940' }, { notForSale: true, value: 700, gameId: 'block-battlegrounds' }],
    // ---- Limited drops: a fixed global stock that other players buy up; each copy has a serial number.
    // limitedStock = copies ever made, soldAtStart = share already gone when the drop is first seen,
    // perHour = copies other players buy per hour while any remain, releasedDaysAgo staggers the drops.
    ['hat_radiant_halo', 'Radiant Halo', 'hat', 'divine', 5000000, 'BlockForge', 'Fifty were ever forged. A ring of pure light that follows its owner everywhere.', { style: 'halo', c1: '#ffe066', c2: '#ffffff' }, { featured: true, limitedStock: 50, soldAtStart: 0.82, perHour: 1.2, releasedDaysAgo: 9 }],
    ['hat_celestial_crown', 'Celestial Crown', 'hat', 'divine', 2500000, 'Starlit Arcade', 'Set with gems cut from a fallen star. Limited to 100 copies.', { style: 'crown', c1: '#fff1a8', c2: '#7fe7ff' }, { featured: true, limitedStock: 100, soldAtStart: 0.64, perHour: 1.6, releasedDaysAgo: 5 }],
    ['head_nebula', 'Nebula Head', 'head', 'exotic', 1200000, 'NeonAtelier', 'A swirling nebula where a head should be. Limited to 150 copies.', { shape: 'void', c1: '#1a0b36', c2: '#ff4fd8' }, { limitedStock: 150, soldAtStart: 0.4, perHour: 2.4, releasedDaysAgo: 3 }],
    ['back_phoenix', 'Phoenix Wings', 'back', 'exotic', 750000, 'Moonloom', 'Wings that burn without burning. Limited to 250 copies.', { style: 'wings', c1: '#ff7a2e', glow: true }, { limitedStock: 250, soldAtStart: 0.55, perHour: 4, releasedDaysAgo: 2 }],
    ['sh_frost_dragon', 'Frost Dragon Pal', 'shoulder', 'exotic', 600000, 'Tinytails Co.', 'A baby dragon made of living ice. Limited to 300 copies.', { style: 'dragon', c1: '#bfe6ff', c2: '#46a8ff' }, { limitedStock: 300, soldAtStart: 0.3, perHour: 5, releasedDaysAgo: 1 }],
    ['hat_frostfire_horns', 'Frostfire Horns', 'hat', 'exotic', 400000, 'IronAnvil Studios', 'One horn of ice, one of flame. Limited to 400 copies.', { style: 'horns', c1: '#bfe6ff', c2: '#ff7a2e' }, { limitedStock: 400, soldAtStart: 1, perHour: 6, releasedDaysAgo: 14 }],
    ['back_gold_jetpack', 'Golden Jetpack', 'back', 'exotic', 350000, 'Gearhead Garage', 'Solid gold thrusters. Completely impractical. Limited to 500 copies.', { style: 'jetpack', c1: '#ffc940', c2: '#39f3ff' }, { limitedStock: 500, soldAtStart: 0.2, perHour: 7, releasedDaysAgo: 0.5 }],
    ['back_starlight_cape', 'Starlight Cape', 'back', 'legendary', 150000, 'NeonAtelier', 'Woven from a clear night sky. Limited to 1,000 copies.', { style: 'cape', c1: '#1f2a6a' }, { limitedStock: 1000, soldAtStart: 0.35, perHour: 14, releasedDaysAgo: 4 }],
    ['acc_prism_visor', 'Prism Visor', 'accessory', 'legendary', 90000, 'NeonAtelier', 'Splits every light into a rainbow. Limited to 2,000 copies.', { style: 'visor', c1: '#ff4fd8' }, { limitedStock: 2000, soldAtStart: 0.1, perHour: 26, releasedDaysAgo: 0.2 }],
    // ---- Update drops: hidden until a developer update (data/updates.js) releases them
    ['hat_champion_crown', 'Champion Crown', 'hat', 'exotic', 450000, 'IronAnvil Studios', 'Released with Champion Season in Block Battlegrounds. Limited to 600 copies.', { style: 'crown', c1: '#ffb454', c2: '#ff3d5a' }, { limitedStock: 600, soldAtStart: 0.04, perHour: 8, releasedDaysAgo: 0, releasedBy: 'upd_bb_champions', notForSale: true }],
    ['sh_phantom_raven', 'Phantom Raven', 'shoulder', 'legendary', 180000, 'Old Harrow Games', 'A raven that is not quite there. Released with Moonlit Manor. Limited to 1,200 copies.', { style: 'bird', c1: '#5a5f7a', c2: '#b67cff' }, { limitedStock: 1200, soldAtStart: 0.05, perHour: 14, releasedDaysAgo: 0, releasedBy: 'upd_mm_moonlit', notForSale: true }],
    ['back_nitro_thrusters', 'Nitro Thrusters', 'back', 'legendary', 120000, 'Nitro Nest', 'Twin neon boosters from the Night City Grand Prix. Limited to 1,500 copies.', { style: 'jetpack', c1: '#39f3ff', c2: '#ff4fd8' }, { limitedStock: 1500, soldAtStart: 0.06, perHour: 18, releasedDaysAgo: 0, releasedBy: 'upd_sr_nightcity', notForSale: true }],
    ['back_royal_wings', 'Royal Pet Wings', 'back', 'legendary', 200000, 'Tinytails Co.', 'Gold-trimmed wings from the Royal Pet Parade. Limited to 1,000 copies.', { style: 'wings', c1: '#ffd66b' }, { limitedStock: 1000, soldAtStart: 0.05, perHour: 12, releasedDaysAgo: 0, releasedBy: 'upd_pw_parade', notForSale: true }],
    ['sh_crystal_drone', 'Crystal Drone', 'shoulder', 'exotic', 520000, 'DeepCore Games', 'A drone grown from a deep-core crystal. Limited to 350 copies.', { style: 'drone', c1: '#ff4fd8', c2: '#7fe7ff' }, { limitedStock: 350, soldAtStart: 0.05, perHour: 5, releasedDaysAgo: 0, releasedBy: 'upd_mm_deepcore', notForSale: true }],
    ['hat_glacier_viking', 'Glacier Viking Helm', 'hat', 'exotic', 300000, 'Bastion Works', 'Carved from the ice of the Winter Siege. Limited to 700 copies.', { style: 'viking', c1: '#bfe6ff', c2: '#e8ecf1' }, { limitedStock: 700, soldAtStart: 0.05, perHour: 9, releasedDaysAgo: 0, releasedBy: 'upd_cs_winter', notForSale: true }],
    // ---- Ultra-rare finds: never sold, found only by finishing games (free, earned by playing)
    ['col_star_fragment', 'Star Fragment', 'collectible', 'divine', 0, 'BlockForge', 'Found by finishing a game: about 1 in 20,000 sessions. Almost nobody has one.', { icon: 'gem', c1: '#fff1a8' }, { notForSale: true, value: 1000000, dropChance: 1 / 20000 }],
    ['col_ember_egg', 'Ember Egg', 'collectible', 'exotic', 0, 'BlockForge', 'Warm to the touch. Found by finishing a game: about 1 in 4,000 sessions.', { icon: 'pearl', c1: '#ff7a2e' }, { notForSale: true, value: 250000, dropChance: 1 / 4000 }],
    // ---- Tools (sold in game stores, used by their game)
    ['tool_titan_pickaxe', 'Titan Pickaxe', 'tool', 'epic', 600, 'DeepCore Games', 'Mega Miners: mining power 12 and it never dulls.', { icon: 'pickaxe', c1: '#8fd3ff' }, { gameId: 'mega-miners', store: true }],
    ['tool_golden_shovel', 'Golden Shovel', 'tool', 'rare', 400, 'Salty Pixel Co.', 'Treasure Islands: dig twice as fast and find more coins.', { icon: 'shovel', c1: '#ffc940' }, { gameId: 'treasure-islands', store: true }],
    ['tool_flame_blade', 'Flame Blade', 'tool', 'rare', 350, 'IronAnvil Studios', 'Block Battlegrounds: a blazing skin for your blade with ember trails.', { icon: 'sword', c1: '#ff7a2e' }, { gameId: 'block-battlegrounds', store: true }],
    ['tool_underglow', 'Neon Underglow', 'tool', 'uncommon', 200, 'Nitro Nest', 'Skyline Racers: a cyan glow under every car you drive.', { icon: 'bolt', c1: '#39f3ff' }, { gameId: 'skyline-racers', store: true }],
  ];

  const BUNDLES = [
    ['bundle_cyber', 'Cyber Ronin Bundle', 'epic', 3400, 'NeonAtelier', 'Visor, vest, backpack, drone and joggers. Save over 20%.', ['acc_visor', 'jacket_circuit', 'back_cyber', 'sh_drone', 'pants_neon'], { featured: true }],
    ['bundle_knight', "Knight's Oath Bundle", 'epic', 2900, 'IronAnvil Studios', 'Chestplate, greaves, helm and sheath.', ['shirt_knight', 'pants_knight', 'hat_viking', 'back_sheath']],
    ['bundle_explorer', 'Explorer Kit', 'rare', 1400, 'Harborline Goods', 'Hat, boots, goggles and a feathered friend.', ['hat_explorer', 'shoes_boots', 'acc_goggles', 'sh_parrot']],
    ['bundle_winter', 'Cozy Winter Set', 'uncommon', 450, 'StitchWorks', 'Beanie, scarf, puffer and slippers.', ['hat_beanie', 'neck_scarf', 'jacket_puffer', 'shoes_slippers']],
    ['bundle_stargazer', 'Stargazer Set', 'legendary', 5600, 'NeonAtelier', 'Galaxy helmet, galaxy tee and star-struck face.', ['hat_galaxy', 'shirt_galaxy', 'face_star'], { featured: true }],
  ];

  const items = {};
  let order = 0;
  for (const r of RAW) {
    const [id, name, cat, rarity, price, creator, desc, look, extra] = r;
    items[id] = Object.assign({ id, name, cat, rarity, price, creator, desc, look: look || {}, order: order++ }, extra || {});
  }
  for (const b of BUNDLES) {
    const [id, name, rarity, price, creator, desc, contents, extra] = b;
    items[id] = Object.assign({ id, name, cat: 'bundle', rarity, price, creator, desc, contents, look: {}, order: order++ }, extra || {});
  }

  BF.ITEMS = items;
  BF.ITEM_LIST = Object.values(items);

  /** Starter loadout for new accounts. */
  BF.STARTER_EQUIP = {
    head: 'head_block', face: 'face_smile', hair: 'hair_tidy', shirt: 'shirt_forge', pants: 'pants_denim',
    jacket: null, shoes: 'shoes_sneakers', hat: 'hat_retro', back: null, neck: null, shoulder: null,
    accessory: null, emote: 'emote_wave', animation: 'anim_default',
  };
  BF.STARTER_SKIN = '#f1c27d';
})((window.BF = window.BF || {}));
