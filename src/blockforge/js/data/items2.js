/**
 * BlockForge — the extended avatar catalog (data only, ADR-0016).
 *
 * The hand-written catalog in data/items.js holds the starter kit, the named
 * originals, limited drops and collectibles. This file adds several hundred
 * more wearables. Each one is a style (a look the 3D rig can draw) dyed in a
 * named colour theme. Styles carry a base rarity; each theme adds a rarity
 * step, so premium dyes (Galaxy, Aurora, Prismatic) of an already rare style
 * reach Legendary or Mythic. Prices come from the rarity band and a stable
 * hash of the id, so they never change between loads.
 *
 * Loads after data/items.js and appends to BF.ITEMS / BF.ITEM_LIST.
 */
(function (BF) {
  'use strict';

  // ------------------------------------------------------------ tuning data

  /** Price band per rarity: [min, max]. A stable hash of the id picks a point in it. */
  const PRICE = {
    common: [55, 160], uncommon: [160, 380], rare: [380, 950], epic: [950, 2600],
    legendary: [2600, 6500], mythic: [8000, 22000],
  };
  /** Highest rarity a generated item can reach (exotic and divine stay limited-only). */
  const MAX_RANK = 5;

  /**
   * Colour themes: [name, c1, c2, rarity step, dye phrase, glow].
   * Tier 0 are everyday dyes, tier 1 seasonal, tier 2 premium, tier 3 cosmic, tier 4 one-offs.
   */
  const THEMES = {
    snow: ['Snow', '#f3f5f9', '#c9d3e0', 0, 'snow white with frosty grey trim'],
    coal: ['Coal', '#2a2e36', '#9aa5b5', 0, 'coal black with slate trim'],
    cherry: ['Cherry', '#d33f49', '#ffffff', 0, 'cherry red with white trim'],
    ocean: ['Ocean', '#1d6fb8', '#8fd3ff', 0, 'deep ocean blue'],
    forest: ['Forest', '#2f6b3a', '#a7d58a', 0, 'forest green with leafy trim'],
    lemon: ['Lemon', '#ffd84a', '#3a3f4b', 0, 'lemon yellow with charcoal trim'],
    mint: ['Mint', '#66e0b8', '#effff8', 0, 'cool mint'],
    bubblegum: ['Bubblegum', '#ff8fc7', '#fff0f7', 0, 'bubblegum pink'],
    cocoa: ['Cocoa', '#6b4226', '#e8c9a0', 0, 'cocoa brown with cream trim'],
    sky: ['Sky', '#8fd3ff', '#ffffff', 0, 'sky blue with cloud-white trim'],
    sunset: ['Sunset', '#ff6f61', '#ffd23f', 1, 'sunset coral fading to gold'],
    lavender: ['Lavender', '#b39ddb', '#f3e8ff', 1, 'soft lavender'],
    ember: ['Ember', '#ff7a2e', '#ffd23f', 1, 'forge-ember orange with gold trim'],
    frost: ['Frost', '#bfe6ff', '#46a8ff', 1, 'icy frost blue'],
    toxic: ['Toxic', '#8cff3a', '#1a2410', 1, 'glowing toxic green', true],
    steel: ['Steel', '#9aa5b5', '#dfe7f2', 1, 'brushed steel'],
    royal: ['Royal', '#4b2a8a', '#ffd23f', 2, 'royal purple with gold trim'],
    neon: ['Neon', '#ff4fd8', '#39f3ff', 2, 'buzzing neon pink and cyan', true],
    gold: ['Golden', '#ffc940', '#fff1a8', 2, 'polished gold'],
    obsidian: ['Obsidian', '#15151c', '#b67cff', 2, 'obsidian black with violet veins'],
    galaxy: ['Galaxy', '#1b1446', '#b67cff', 3, 'a swirl of galaxy violet', true],
    aurora: ['Aurora', '#39f3ff', '#9be7a0', 3, 'shimmering aurora cyan and green', true],
    inferno: ['Inferno', '#ff3d1f', '#ffe066', 3, 'white-hot inferno', true],
    prism: ['Prismatic', '#ff4fd8', '#fff1a8', 4, 'every colour of a prism at once', true],
  };
  const TIERS = [0, 1, 2, 3, 4].map((t) => Object.keys(THEMES).filter((k) => THEMES[k][3] === t));

  /** Hair dyes: [name, colour, rarity step]. */
  const HAIR_DYES = {
    jet: ['Jet', '#1b1b22', 0], chestnut: ['Chestnut', '#6b4226', 0], honey: ['Honey', '#d9a441', 0],
    ginger: ['Ginger', '#c8561e', 0], platinum: ['Platinum', '#eee6d0', 0], silver: ['Silver', '#c3c9d2', 0],
    cherry: ['Cherry', '#d33f49', 1], ocean: ['Ocean', '#2f6fe0', 1], mint: ['Mint', '#66e0b8', 1],
    lilac: ['Lilac', '#b39ddb', 1], bubblegum: ['Bubblegum', '#ff8fc7', 1], ember: ['Ember', '#ff7a2e', 1],
    neon: ['Neon', '#ff4fd8', 2], ice: ['Ice', '#bfe6ff', 2], toxic: ['Toxic', '#8cff3a', 2],
  };

  /**
   * Styles per category: [style, name, base rank, creator, description, dyes, opts].
   * `dyes` is either an explicit list of theme keys or [t0, t1, t2, t3, t4], a count
   * picked from each theme tier. opts: {key:'shape'} for heads, {fixed:{c1}} to keep
   * the main colour and dye only the trim, {extra} copied onto the item.
   */
  const S = {
    hat: [
      ['tophat', 'Top Hat', 1, 'StitchWorks', 'Tall, proper and extremely polite.', [2, 2, 1, 1, 0]],
      ['cowboy', 'Cowboy Hat', 0, 'Harborline Goods', 'Wide brim for wide horizons.', [3, 2, 1, 0, 0]],
      ['chef', 'Chef Toque', 0, 'StitchWorks', 'Certified to cook a flawless pixel pancake.', ['snow', 'cherry', 'lemon', 'sunset', 'gold']],
      ['party', 'Party Hat', 0, 'Starlit Arcade', 'Every lobby is a party if you believe.', [3, 2, 1, 1, 0]],
      ['antlers', 'Antlers', 1, 'Moonloom', 'Branching antlers from the Moonloom woods.', ['cocoa', 'snow', 'frost', 'gold', 'aurora']],
      ['catears', 'Cat Ears', 0, 'Tinytails Co.', 'Twitch when you are surprised.', [3, 2, 1, 1, 0]],
      ['propeller', 'Propeller Cap', 0, 'Gearhead Garage', 'Spins up when you run. No lift, all style.', [3, 2, 1, 0, 0]],
      ['flowers', 'Flower Crown', 0, 'Moonloom', 'Picked fresh from the meadow servers.', ['bubblegum', 'lemon', 'sky', 'lavender', 'sunset', 'gold', 'aurora']],
      ['bucket', 'Bucket Hat', 0, 'Harborline Goods', 'Soft, floppy and weatherproof.', [4, 2, 1, 0, 0]],
      ['santa', 'Holiday Hat', 0, 'StitchWorks', 'A fluffy pom-pom for the festive season.', ['cherry', 'forest', 'ocean', 'frost', 'gold']],
      ['tiara', 'Tiara', 2, 'PixelSmiths', 'A delicate band set with one bright gem.', [2, 2, 2, 1, 1]],
      ['straw', 'Straw Hat', 0, 'Harborline Goods', 'Hand-woven for long summer days.', ['cherry', 'ocean', 'forest', 'lemon', 'sunset'], { fixed: { c1: '#e8c98a' } }],
      ['frog', 'Frog Hat', 1, 'Tinytails Co.', 'A plush frog that sits on your head and judges gently.', ['forest', 'mint', 'lemon', 'bubblegum', 'toxic', 'gold']],
      ['beret', 'Beret', 0, 'StitchWorks', 'Tilted at exactly the right angle.', [3, 2, 1, 0, 0]],
      ['grad', 'Graduation Cap', 1, 'PixelSmiths', 'You finished the tutorial. Congratulations.', ['coal', 'ocean', 'cherry', 'royal', 'gold']],
      ['cone', 'Traffic Cone', 0, 'Gearhead Garage', 'Warns everyone that you are under construction.', ['sunset', 'lemon', 'mint', 'neon', 'toxic']],
      ['knight', 'Knight Helm', 2, 'IronAnvil Studios', 'A full helm with a plume that bobs as you walk.', [1, 2, 2, 1, 0]],
      ['cap', 'Snapback', 0, 'Kickoff Club', 'Two-tone crown, flat brim.', [4, 3, 1, 0, 0]],
      ['beanie', 'Knit Beanie', 0, 'StitchWorks', 'Warm ears, warm heart.', [4, 2, 0, 0, 0]],
      ['wizard', 'Wizard Hat', 2, 'Moonloom', 'Pointy, mysterious, slightly singed.', [1, 2, 2, 2, 0]],
      ['horns', 'Horns', 2, 'IronAnvil Studios', 'A pair of curling horns.', [1, 2, 1, 2, 0]],
      ['crown', 'Crown', 3, 'PixelSmiths', 'Eight bits of royalty.', [0, 2, 2, 2, 1]],
      ['halo', 'Halo', 3, 'Moonloom', 'A floating ring of light.', ['snow', 'sky', 'frost', 'gold', 'aurora', 'inferno', 'prism']],
      ['helmet', 'Space Helmet', 2, 'Gearhead Garage', 'A bubble visor for low-gravity servers.', [1, 2, 1, 2, 0]],
      ['viking', 'Viking Helm', 2, 'IronAnvil Studios', 'Horned, dented and proud of it.', [1, 2, 1, 1, 0]],
      ['hood', 'Hood', 1, 'Moonloom', 'Keeps the rain and the spoilers out.', [3, 2, 1, 1, 0]],
      ['headphones', 'Headphones', 1, 'NeonAtelier', 'Studio sound for every lobby.', [2, 2, 2, 1, 0]],
      ['ears', 'Bunny Ears', 1, 'Tinytails Co.', 'Hop to it.', [2, 2, 1, 1, 0]],
      ['explorer', 'Explorer Hat', 1, 'Harborline Goods', 'Wide brim, leather band, many stories.', ['cocoa', 'forest', 'snow', 'steel', 'gold']],
      ['blockcrown', 'Block Crown', 2, 'PixelSmiths', 'Stacked blocks with studded corners.', [0, 2, 2, 1, 0]],
    ],
    head: [
      ['pumpkin', 'Pumpkin Head', 1, 'Moonloom', 'Carved with a friendly grin.', ['sunset', 'lemon', 'snow', 'toxic', 'obsidian', 'inferno'], { key: 'shape' }],
      ['robot', 'Robot Head', 2, 'Gearhead Garage', 'Blinks politely. Antenna included.', ['steel', 'cherry', 'ocean', 'lemon', 'gold', 'neon'], { key: 'shape' }],
      ['crystal', 'Crystal Head', 3, 'NeonAtelier', 'A faceted head grown in the Crystal Caves.', ['frost', 'bubblegum', 'toxic', 'gold', 'royal', 'inferno', 'prism'], { key: 'shape' }],
      ['void', 'Void Head', 4, 'NeonAtelier', 'A pocket of starlit nothing where a head should be.', ['ocean', 'forest', 'cherry', 'aurora'], { key: 'shape', dark: true }],
    ],
    shirt: [
      ['plaid', 'Plaid Shirt', 0, 'StitchWorks', 'Soft flannel for cabin servers.', [4, 2, 1, 0, 0]],
      ['camo', 'Camo Tee', 0, 'Harborline Goods', 'Blend into any map. Or stand out in Neon.', [3, 2, 1, 1, 0]],
      ['flame', 'Flame Tee', 1, 'IronAnvil Studios', 'Hot-rod flames licking up from the hem.', [2, 2, 1, 1, 0]],
      ['heart', 'Heart Tee', 0, 'Tinytails Co.', 'Wear your heart on your shirt.', [4, 2, 1, 0, 0]],
      ['dots', 'Polka Dot Tee', 0, 'StitchWorks', 'Dots, dots and more dots.', [4, 2, 0, 0, 0]],
      ['split', 'Split Tee', 0, 'PixelSmiths', 'Half one colour, half the other.', [4, 2, 1, 0, 0]],
      ['rainbow', 'Rainbow Tee', 1, 'Starlit Arcade', 'A full rainbow across the chest.', ['snow', 'coal', 'sky', 'galaxy']],
      ['zigzag', 'Zigzag Tee', 0, 'PixelSmiths', 'Electric zigzags from shoulder to hem.', [3, 2, 1, 0, 0]],
      ['check', 'Checker Tee', 0, 'Kickoff Club', 'Checkered like a finish flag.', [3, 2, 1, 0, 0]],
      ['star', 'Star Tee', 0, 'Starlit Arcade', 'One big star, right in the middle.', [3, 2, 1, 1, 0]],
      ['circuit', 'Circuit Tee', 1, 'NeonAtelier', 'Printed traces that almost look live.', [1, 2, 2, 1, 0]],
      ['bolt', 'Bolt Tee', 0, 'Gearhead Garage', 'A lightning bolt for fast forgers.', [3, 2, 1, 1, 0]],
      ['sport', 'Sport Jersey', 0, 'Kickoff Club', 'Numbered and ready for kickoff.', [4, 3, 1, 0, 0]],
      ['stripe', 'Stripe Tee', 0, 'StitchWorks', 'Bold stripes, every day.', [4, 2, 0, 0, 0]],
      ['hoodie', 'Hoodie', 0, 'StitchWorks', 'Warm, soft and pocketed.', [4, 2, 1, 0, 0]],
      ['tropical', 'Tropical Shirt', 0, 'Harborline Goods', 'Hibiscus season, all year.', [2, 2, 1, 0, 0]],
      ['tux', 'Tuxedo', 2, 'StitchWorks', 'For formal occasions and boss fights.', ['coal', 'snow', 'royal', 'obsidian', 'gold']],
      ['armor', 'Chestplate', 2, 'IronAnvil Studios', 'Hammered plate with a crest.', [1, 2, 2, 1, 0]],
      ['galaxy', 'Nebula Tee', 3, 'NeonAtelier', 'A whole nebula, machine washable.', [1, 2, 1, 2, 0]],
      ['logo', 'Chevron Tee', 0, 'BlockForge', 'The ember chevron in fresh colours.', [4, 2, 0, 0, 0]],
    ],
    pants: [
      ['jeans', 'Jeans', 0, 'StitchWorks', 'Goes with everything.', [4, 2, 1, 0, 0]],
      ['shorts', 'Shorts', 0, 'Harborline Goods', 'Built for beach servers.', [4, 2, 0, 0, 0]],
      ['cargo', 'Cargo Pants', 0, 'StitchWorks', 'Pockets for your pockets.', [3, 2, 1, 0, 0]],
      ['track', 'Track Pants', 0, 'Kickoff Club', 'Stripe down the side for extra speed.', [3, 2, 2, 1, 0]],
      ['armor', 'Greaves', 2, 'IronAnvil Studios', 'Clanky, but heroic.', [1, 2, 1, 1, 0]],
    ],
    jacket: [
      ['lab', 'Lab Coat', 1, 'Gearhead Garage', 'For science, mostly the explosive kind.', ['snow', 'mint', 'sky', 'toxic', 'obsidian']],
      ['puffer', 'Puffer', 1, 'StitchWorks', 'Puffy enough to bounce off walls.', [3, 2, 1, 1, 0]],
      ['bomber', 'Bomber', 1, 'Harborline Goods', 'Classic shell with a bright lining.', [3, 2, 1, 0, 0]],
      ['leather', 'Leather Jacket', 2, 'StitchWorks', 'Scuffed in all the right places.', [2, 2, 1, 1, 0]],
      ['vest', 'Tech Vest', 2, 'NeonAtelier', 'Light traces along every seam.', [1, 2, 2, 1, 0]],
    ],
    shoes: [
      ['sneaker', 'Sneakers', 0, 'Kickoff Club', 'Fresh out of the box.', [4, 2, 1, 1, 0]],
      ['slipper', 'Slippers', 0, 'Moonloom', 'Maximum comfort, minimum traction.', [4, 1, 0, 0, 0]],
      ['hightop', 'High-Tops', 0, 'Kickoff Club', 'Laced to the ankle.', [3, 2, 1, 0, 0]],
      ['boot', 'Boots', 1, 'Harborline Goods', 'Broken in on a hundred islands.', [3, 2, 1, 0, 0]],
      ['rocket', 'Rocket Boots', 3, 'Gearhead Garage', 'Thrusters included, landing not guaranteed.', [0, 2, 1, 2, 0]],
    ],
    back: [
      ['guitar', 'Guitar', 1, 'Starlit Arcade', 'Slung and ready for an encore.', [2, 2, 2, 1, 0]],
      ['balloons', 'Balloon Bunch', 0, 'Starlit Arcade', 'Three balloons that bob as you move.', [4, 2, 1, 0, 0]],
      ['quiver', 'Quiver', 1, 'IronAnvil Studios', 'A full quiver of feathered arrows.', ['cocoa', 'forest', 'steel', 'gold', 'obsidian']],
      ['tail', 'Tail', 1, 'Tinytails Co.', 'A fluffy tail that swishes when you walk.', [3, 2, 1, 1, 0]],
      ['shield', 'Round Shield', 2, 'IronAnvil Studios', 'Dented from a hundred arena rounds.', [1, 2, 2, 1, 0]],
      ['surfboard', 'Surfboard', 1, 'Harborline Goods', 'Waxed and ready for the Harbor swell.', [3, 2, 1, 0, 0]],
      ['shell', 'Shell', 0, 'Tinytails Co.', 'Slow and steady wins the obby.', [2, 2, 1, 0, 0]],
      ['sword', 'Sheath', 1, 'IronAnvil Studios', 'Ornamental. Probably.', [1, 2, 1, 1, 0]],
      ['cape', 'Cape', 2, 'StitchWorks', 'Billows dramatically even indoors.', [2, 2, 2, 2, 0]],
      ['backpack', 'Backpack', 1, 'NeonAtelier', 'Charges your gear with glowing cells.', [2, 2, 1, 1, 0]],
      ['wings', 'Wings', 3, 'Moonloom', 'Feathered and soft as clouds.', [1, 1, 1, 3, 1]],
      ['jetpack', 'Jetpack', 3, 'Gearhead Garage', 'Twin boosters with a bright exhaust.', [0, 2, 1, 2, 0]],
    ],
    neck: [
      ['lei', 'Flower Lei', 0, 'Harborline Goods', 'Aloha from the Harbor.', ['bubblegum', 'lemon', 'sky', 'sunset', 'lavender', 'aurora']],
      ['tie', 'Necktie', 0, 'StitchWorks', 'Business on top, obby underneath.', [4, 2, 1, 0, 0]],
      ['pendant', 'Gem Pendant', 2, 'PixelSmiths', 'A cut gem on a fine chain.', [1, 2, 2, 2, 1]],
      ['spikes', 'Spiked Collar', 1, 'IronAnvil Studios', 'Not a dog collar. Absolutely not.', [2, 2, 1, 0, 0]],
      ['scarf', 'Scarf', 0, 'StitchWorks', 'Candy stripes for chilly servers.', [4, 2, 0, 0, 0]],
      ['bandana', 'Bandana', 0, 'Harborline Goods', 'Windswept and ready.', [4, 2, 0, 0, 0]],
      ['bowtie', 'Bowtie', 0, 'StitchWorks', 'Instantly thirty percent fancier.', [3, 2, 1, 0, 0]],
      ['chain', 'Chain', 2, 'PixelSmiths', 'Chunky links, chunky flex.', ['steel', 'frost', 'gold', 'obsidian', 'galaxy']],
      ['medal', 'Medal', 2, 'Kickoff Club', 'Awarded for winning. Or buying.', ['cherry', 'ocean', 'steel', 'gold', 'aurora']],
    ],
    shoulder: [
      ['bunny', 'Bunny Pal', 1, 'Tinytails Co.', 'Hops in place on your shoulder.', [3, 2, 1, 1, 0], { extra: { pet: true } }],
      ['penguin', 'Penguin Pal', 1, 'Tinytails Co.', 'Waddles even while sitting still.', [3, 2, 1, 1, 0], { extra: { pet: true } }],
      ['slime', 'Slime Pal', 1, 'Starlit Arcade', 'Wobbly, friendly and a little sticky.', [3, 2, 1, 1, 0], { extra: { pet: true } }],
      ['ghost', 'Ghost Pal', 2, 'Old Harrow Games', 'Floats beside you and says boo very quietly.', ['snow', 'sky', 'lavender', 'toxic', 'obsidian', 'aurora'], { extra: { pet: true } }],
      ['bee', 'Bee Buddy', 1, 'Tinytails Co.', 'Buzzes loops around your head.', ['lemon', 'bubblegum', 'sky', 'sunset', 'gold', 'neon'], { extra: { pet: true } }],
      ['owl', 'Owl Pal', 2, 'Moonloom', 'Turns its head when you are not looking.', ['cocoa', 'snow', 'coal', 'frost', 'royal', 'galaxy'], { extra: { pet: true } }],
      ['cat', 'Kitty', 1, 'Tinytails Co.', 'A tiny cat that naps on your shoulder.', [3, 2, 1, 1, 0], { extra: { pet: true } }],
      ['fox', 'Fox Pal', 2, 'Tinytails Co.', 'A fox kit with a bright tail.', [2, 2, 1, 1, 0], { extra: { pet: true } }],
      ['bird', 'Songbird', 1, 'Harborline Goods', 'Hops and chirps along with the music.', [3, 2, 1, 1, 0], { extra: { pet: true } }],
      ['dragon', 'Dragon Pal', 3, 'Tinytails Co.', 'Sneezes tiny sparks.', [0, 2, 2, 2, 1], { extra: { pet: true } }],
      ['drone', 'Drone', 2, 'Gearhead Garage', 'A loyal little quadcopter.', [1, 2, 2, 1, 0]],
      ['pads', 'Shoulder Pads', 1, 'IronAnvil Studios', 'Intimidating in every lobby.', [2, 2, 1, 0, 0]],
    ],
    accessory: [
      ['eyepatch', 'Eyepatch', 0, 'Harborline Goods', 'Arr.', ['coal', 'cocoa', 'cherry', 'gold', 'obsidian']],
      ['mustache', 'Mustache', 0, 'StitchWorks', 'Distinguished. Twirlable.', ['coal', 'cocoa', 'snow', 'sunset', 'gold', 'neon']],
      ['heartshades', 'Heart Shades', 1, 'Tinytails Co.', 'Heart-shaped lenses for heart-shaped days.', [3, 2, 1, 1, 0]],
      ['sunglasses', 'Sunglasses', 0, 'Harborline Goods', 'Dark lenses, bright future.', [3, 2, 1, 1, 0]],
      ['vr', 'VR Headset', 2, 'Gearhead Garage', 'Now you are in a game inside a game.', [1, 2, 2, 1, 0]],
      ['clownnose', 'Clown Nose', 0, 'Starlit Arcade', 'Honk.', ['cherry', 'bubblegum', 'lemon', 'toxic', 'gold']],
      ['glasses', 'Glasses', 0, 'PixelSmiths', 'Thick frames, sharp mind.', [4, 2, 1, 0, 0]],
      ['monocle', 'Monocle', 1, 'StitchWorks', 'Quite so.', ['gold', 'steel', 'coal', 'royal', 'galaxy']],
      ['starshades', 'Star Shades', 1, 'NeonAtelier', 'Star-shaped and extremely cool.', [2, 2, 2, 1, 0]],
      ['goggles', 'Goggles', 1, 'Harborline Goods', 'For the open sky.', [2, 2, 1, 1, 0]],
      ['visor', 'Visor', 2, 'NeonAtelier', 'A light bar across the eyes.', [1, 2, 2, 2, 0]],
      ['mask', 'Mask', 2, 'Moonloom', 'Nobody knows who wears it.', [1, 1, 2, 2, 0]],
    ],
  };

  /** Hair styles: [style, name, creator, description, dye keys]. */
  const HAIR = [
    ['short', 'Short Hair', 'StitchWorks', 'Neat and easy.', ['jet', 'chestnut', 'honey', 'ginger', 'platinum', 'ocean', 'mint', 'neon']],
    ['spiky', 'Spiky Hair', 'IronAnvil Studios', 'Styled with forge heat.', ['jet', 'honey', 'platinum', 'silver', 'cherry', 'ocean', 'ice', 'toxic']],
    ['long', 'Long Hair', 'Moonloom', 'Flows like a river.', ['jet', 'chestnut', 'honey', 'ginger', 'platinum', 'lilac', 'bubblegum', 'ice']],
    ['bun', 'Top Bun', 'StitchWorks', 'A tidy top-knot.', ['jet', 'chestnut', 'ginger', 'silver', 'cherry', 'lilac', 'ember', 'neon']],
    ['mohawk', 'Mohawk', 'NeonAtelier', 'Straight up, all day.', ['jet', 'platinum', 'cherry', 'ocean', 'mint', 'ember', 'neon', 'toxic']],
    ['curly', 'Curls', 'StitchWorks', 'Bouncy curls with a mind of their own.', ['jet', 'chestnut', 'honey', 'ginger', 'silver', 'bubblegum', 'mint', 'ice']],
    ['ponytail', 'Ponytail', 'StitchWorks', 'Swishes when you jump.', ['jet', 'chestnut', 'honey', 'platinum', 'cherry', 'ocean', 'lilac', 'neon']],
  ];

  /** Faces (no dye). */
  const FACES = [
    ['face_happy', 'Sunny Smile', 'common', 'PixelSmiths', 'Rosy cheeks and a big open smile.', 'happy'],
    ['face_cool', 'Too Cool', 'uncommon', 'NeonAtelier', 'Half-closed eyes and a sideways smirk.', 'cool'],
    ['face_angry', 'Grumpy', 'common', 'IronAnvil Studios', 'Lost the last round. Still upset.', 'angry'],
    ['face_surprised', 'Gasp', 'common', 'Starlit Arcade', 'Wide eyes, round mouth, no words.', 'surprised'],
    ['face_blush', 'Blushing', 'uncommon', 'Tinytails Co.', 'Someone said something nice.', 'blush'],
    ['face_smug', 'Smug', 'uncommon', 'PixelSmiths', 'Knows exactly what they did.', 'smug'],
    ['face_derp', 'Derp', 'rare', 'Starlit Arcade', 'One eye up, one eye down, tongue out.', 'derp'],
    ['face_hearts', 'Heart Eyes', 'rare', 'Tinytails Co.', 'In love with this outfit.', 'hearts'],
  ];

  /** New hand-picked bundles: [id, name, min rarity, creator, desc, contents]. Price is 80% of the parts; rarity is at least the rarest part. */
  const BUNDLES = [
    ['bundle_farmhand', 'Farmhand Set', 'uncommon', 'Harborline Goods', 'Straw hat, plaid, jeans, boots and a bunny friend.', ['hat_straw_cherry', 'shirt_plaid_cherry', 'pants_jeans_ocean', 'shoes_boot_cocoa', 'sh_bunny_snow']],
    ['bundle_pirate', 'Pirate Captain Set', 'rare', 'Harborline Goods', 'Eyepatch, parrot, bandana and a sheath at your back.', ['acc_eyepatch_coal', 'sh_bird_cherry', 'neck_bandana_cherry', 'back_sword_steel', 'shoes_boot_coal']],
    ['bundle_rockstar', 'Rockstar Set', 'epic', 'Starlit Arcade', 'Guitar, leather jacket, star shades and a neon mohawk.', ['back_guitar_neon', 'jacket_leather_coal', 'acc_starshades_neon', 'hair_mohawk_neon', 'shoes_hightop_coal']],
    ['bundle_beach', 'Beach Day Set', 'uncommon', 'Harborline Goods', 'Surfboard, lei, shorts, sunglasses and a bucket hat.', ['back_surfboard_sunset', 'neck_lei_bubblegum', 'pants_shorts_sky', 'acc_sunglasses_coal', 'hat_bucket_lemon']],
    ['bundle_royal', 'Royal Court Set', 'legendary', 'PixelSmiths', 'Crown, cape, pendant and a tuxedo fit for the throne.', ['hat_crown_royal', 'back_cape_royal', 'neck_pendant_royal', 'shirt_tux_royal']],
    ['bundle_spooky', 'Haunted Set', 'rare', 'Old Harrow Games', 'Pumpkin head, ghost pal, mask and an obsidian cape.', ['head_pumpkin_sunset', 'sh_ghost_snow', 'acc_mask_obsidian', 'back_cape_obsidian']],
    ['bundle_frosty', 'Frostbite Set', 'epic', 'Moonloom', 'Frost wings, penguin pal, puffer and a frost beanie.', ['back_wings_frost', 'sh_penguin_frost', 'jacket_puffer_frost', 'hat_beanie_frost', 'shoes_boot_frost']],
    ['bundle_arcade', 'Arcade Kid Set', 'rare', 'Starlit Arcade', 'Propeller cap, VR headset, checker tee and a slime pal.', ['hat_propeller_lemon', 'acc_vr_neon', 'shirt_check_coal', 'sh_slime_toxic']],
  ];

  /** New limited drops: same shape as data/items.js limiteds. */
  const LIMITEDS = [
    ['hat_aurora_tiara', 'Aurora Tiara', 'hat', 'exotic', 480000, 'PixelSmiths', 'Set with a gem that holds the northern lights. Limited to 450 copies.', { style: 'tiara', c1: '#39f3ff', c2: '#9be7a0', glow: true }, { limitedStock: 450, soldAtStart: 0.28, perHour: 6, releasedDaysAgo: 1.5 }],
    ['sh_starlight_owl', 'Starlight Owl', 'shoulder', 'exotic', 420000, 'Moonloom', 'An owl woven from the night sky. Limited to 500 copies.', { style: 'owl', c1: '#1f2a6a', c2: '#fff1a8' }, { pet: true, limitedStock: 500, soldAtStart: 0.36, perHour: 7, releasedDaysAgo: 2.5 }],
    ['back_prism_guitar', 'Prism Guitar', 'back', 'legendary', 160000, 'Starlit Arcade', 'Every string rings a different colour. Limited to 1,200 copies.', { style: 'guitar', c1: '#ff4fd8', c2: '#fff1a8' }, { limitedStock: 1200, soldAtStart: 0.15, perHour: 16, releasedDaysAgo: 0.7 }],
    ['hat_obsidian_knight', 'Obsidian Knight Helm', 'hat', 'exotic', 650000, 'IronAnvil Studios', 'Forged in the deepest furnace. Limited to 300 copies.', { style: 'knight', c1: '#15151c', c2: '#b67cff' }, { limitedStock: 300, soldAtStart: 0.5, perHour: 4, releasedDaysAgo: 6 }],
  ];

  // ------------------------------------------------------------- generation

  /** Stable 32-bit hash of a string (FNV-1a). */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /** Price for a rarity, placed in its band by the id's hash and rounded to a tidy number. */
  function priceFor(id, rarity) {
    const [lo, hi] = PRICE[rarity];
    const p = lo + (hash(id) % 1000) / 1000 * (hi - lo);
    const step = p >= 5000 ? 250 : p >= 1000 ? 50 : p >= 300 ? 10 : 5;
    return Math.round(p / step) * step;
  }

  /** Themes for a style: an explicit list, or `n` per tier picked by a stable shuffle. */
  function themesFor(style, dyes) {
    if (typeof dyes[0] === 'string') return dyes;
    const out = [];
    dyes.forEach((n, tier) => {
      const pool = TIERS[tier].slice().sort((a, b) => hash(style + a) - hash(style + b));
      out.push(...pool.slice(0, n));
    });
    return out;
  }

  const PREFIX = { hat: 'hat', head: 'head', shirt: 'shirt', pants: 'pants', jacket: 'jacket', shoes: 'shoes', back: 'back', neck: 'neck', shoulder: 'sh', accessory: 'acc' };
  const rarityAt = (rank) => BF.RARITY_ORDER[Math.min(MAX_RANK, rank)];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const added = [];
  const taken = new Set(BF.ITEM_LIST.map((i) => i.name));
  /** Add an item unless its id or name is already used (hand-written items win). */
  const push = (it) => {
    if (BF.ITEMS[it.id] || taken.has(it.name) || added.some((x) => x.id === it.id)) return;
    taken.add(it.name);
    added.push(it);
  };

  // limited drops first so their names win over a generated dye of the same style
  for (const [id, name, cat, rarity, price, creator, desc, look, extra] of LIMITEDS) push(Object.assign({ id, name, cat, rarity, price, creator, desc, look }, extra));

  for (const cat of Object.keys(S)) {
    for (const [style, base, rank, creator, desc, dyes, opts] of S[cat]) {
      const o = opts || {};
      for (const key of themesFor(style, dyes)) {
        const [tname, c1, c2, step, phrase, glow] = THEMES[key];
        const id = PREFIX[cat] + '_' + style + '_' + key;
        const rarity = rarityAt(rank + step);
        const look = { [o.key || 'style']: style, c1, c2 };
        if (o.fixed) Object.assign(look, o.fixed, { c2: c1 });
        if (o.dark) { look.c1 = '#0e0a1c'; look.c2 = c1; }
        if (glow) look.glow = true;
        if (style === 'sport') look.num = 1 + hash(id) % 99;
        push(Object.assign({ id, name: tname + ' ' + base, cat, rarity, price: priceFor(id, rarity), creator, desc: desc + ' ' + cap(phrase) + '.', look, fresh: true }, o.extra || {}));
      }
    }
  }
  for (const [style, base, creator, desc, dyes] of HAIR) {
    for (const key of dyes) {
      const [dname, color, step] = HAIR_DYES[key];
      const id = 'hair_' + style + '_' + key;
      const rarity = rarityAt(step + (style === 'mohawk' ? 1 : 0));
      push({ id, name: dname + ' ' + base, cat: 'hair', rarity, price: priceFor(id, rarity), creator, desc: desc + ' Dyed ' + dname.toLowerCase() + '.', look: { style, c1: color }, fresh: true });
    }
  }
  for (const [id, name, rarity, creator, desc, style] of FACES) push({ id, name, cat: 'face', rarity, price: priceFor(id, rarity), creator, desc, look: { style }, fresh: true });

  /** A bundle part by id; when that dye was not generated, the first dye of the same style. */
  function resolve(id) {
    if (BF.ITEMS[id]) return BF.ITEMS[id];
    const stem = id.slice(0, id.lastIndexOf('_') + 1);
    return added.find((i) => i.id.startsWith(stem)) || null;
  }

  let order = BF.ITEM_LIST.reduce((m, i) => Math.max(m, i.order), -1) + 1;
  for (const it of added) { it.order = order++; BF.ITEMS[it.id] = it; }
  for (let [id, name, rarity, creator, desc, contents] of BUNDLES) { // eslint-disable-line prefer-const
    const parts = contents.map(resolve).filter(Boolean);
    if (parts.length !== contents.length) continue; // a part was renamed: skip rather than sell a broken bundle
    const price = Math.round(parts.reduce((s, p) => s + p.price, 0) * 0.8 / 10) * 10;
    rarity = parts.reduce((r, p) => (BF.RARITY[p.rarity].rank > BF.RARITY[r].rank ? p.rarity : r), rarity);
    BF.ITEMS[id] = { id, name, cat: 'bundle', rarity, price, creator, desc, contents: parts.map((p) => p.id), look: {}, fresh: true, order: order++ };
  }

  BF.ITEM_LIST = Object.values(BF.ITEMS);
  /** Colour themes used by the extended catalog (for tests and tooling). */
  BF.ITEM_THEMES = THEMES;
})((window.BF = window.BF || {}));
