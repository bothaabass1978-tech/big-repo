/**
 * BlockForge — the second wave of built-in games: 50 games on ten new engines
 * (js/games/runner.js, party.js, tag.js, fishing.js, farm.js, restaurant.js,
 * flight.js, golf.js, spooky.js, quiz.js), five variants each. Every game has
 * its own studio, description, passes, badges, leaderboard and chat lines;
 * `config.variant` tells the engine which version to run.
 */
(function (BF) {
  'use strict';

  const pass = (id, name, price, desc, effect, icon) => ({ id, name, price, desc, effect, icon: icon || 'ticket' });
  const badge = (id, name, desc, icon) => ({ id, name, desc, icon: icon || 'medal' });
  const lb = (stat, label, order, format) => ({ stat, label, order: order || 'desc', format: format || 'num' });

  /** Per engine: badges (suffix, name, description, icon), leaderboard, controls, how to play, engine passes. */
  const TYPE = {
    runner: {
      genre: 'Obby', cats: ['Action'], maxPlayers: 12, bots: 6,
      badges: [['win', 'Last One Running', 'Outlast every other runner.', 'trophy'], ['1k', 'Kilometre Club', 'Run 1,000 m in one go.', 'run'], ['coins', 'Coin Vacuum', 'Grab 150 coins in one run.', 'gem']],
      lb: [lb('bestDistance', 'Best Distance'), lb('bestScore', 'Best Score'), lb('wins', 'Wins')],
      controls: 'A / D or arrows switch lanes · Space / W jump · S slide',
      howTo: 'Keep running. Jump low barriers, slide under high ones and switch lanes around blocks. Outlast every other runner to win.',
      passes: [['second_wind', 'Second Wind', 350, 'Survive one crash per run.', 'heart'], ['magnet', 'Super Magnet', 250, 'Coin magnets last twice as long.', 'gem'], ['head_start', 'Head Start', 200, 'Start every run with a 3-second boost.', 'rocket']],
    },
    party: {
      genre: 'Social', cats: ['Action'], maxPlayers: 16, bots: 7,
      badges: [['win', 'Party Champion', 'Win a whole party.', 'trophy'], ['round', 'Round Winner', 'Win a single round.', 'star'], ['sweep', 'Clean Sweep', 'Win every round of a party.', 'crown']],
      lb: [lb('wins', 'Parties Won'), lb('bestPoints', 'Best Points'), lb('roundsWon', 'Rounds Won')],
      controls: 'WASD / arrows move · Space jump · E / Shift shove',
      howTo: 'Survive each minigame to score points. The player with the most points after the last round wins the party.',
      passes: [['double_jump', 'Double Jump', 300, 'Jump again in mid-air.', 'chevronUp'], ['heavy', 'Heavyweight', 250, 'Shoves push you half as far.', 'shield'], ['lucky', 'Lucky Star', 300, '+1 point every round you survive.', 'star']],
    },
    tag: {
      genre: 'Action', cats: ['Social'], maxPlayers: 14, bots: 7,
      badges: [['win', 'Untouchable', 'Win a round.', 'trophy'], ['clutch', 'Clutch', 'Win with less than 10 seconds to spare.', 'timer'], ['tagger', 'Tag Master', 'Tag 5 players in one round.', 'target']],
      lb: [lb('wins', 'Wins'), lb('tags', 'Tags'), lb('bestSurvival', 'Longest Survival', 'desc', 'clock')],
      controls: 'WASD / arrows move · Shift sprint · E interact',
      howTo: 'Every round has its own rules shown at the start: run, hide, tag or carry. Win before the timer runs out.',
      passes: [['sprint', 'Sprinter', 300, 'Run 12% faster.', 'run'], ['stealth', 'Stealth Suit', 350, 'Seekers spot you from 30% closer.', 'eyeOff'], ['decoy', 'Decoy Shield', 300, 'Block the first tag every round.', 'shield']],
    },
    fishing: {
      genre: 'Simulator', cats: ['Adventure'], maxPlayers: 12, bots: 5,
      badges: [['legend', 'Legendary Angler', 'Catch a legendary fish.', 'crown'], ['ten', 'Full Bucket', 'Catch 10 fish in one trip.', 'gem'], ['perfect', 'Perfect Reel', 'Land a fish without ever leaving the green zone.', 'target']],
      lb: [lb('bestHaul', 'Best Haul'), lb('fishCaught', 'Fish Caught'), lb('legendaries', 'Legendaries')],
      controls: 'Hold Space to charge a cast · Space when the bobber dips · Hold Space to reel',
      howTo: 'Cast, wait for a bite, strike, then keep the line tension in the green while you reel. Bigger and rarer fish are worth more.',
      passes: [['pro_rod', 'Pro Rod', 350, 'The green reeling zone is 35% wider.', 'target'], ['lucky_bait', 'Lucky Bait', 400, 'Rare fish bite twice as often.', 'sparkle'], ['fast_cast', 'Quick Bites', 250, 'Fish bite 40% sooner.', 'timer']],
    },
    farm: {
      genre: 'Tycoon', cats: ['Simulator'], maxPlayers: 10, bots: 4,
      badges: [['goal', 'Market Day', 'Reach the season goal.', 'trophy'], ['giant', 'Prize Crop', 'Harvest a golden crop.', 'star'], ['rich', 'Big Harvest', 'Earn 2,000 farm coins in one season.', 'wallet']],
      lb: [lb('bestSeason', 'Best Season'), lb('harvests', 'Harvests'), lb('wins', 'Goals Reached')],
      controls: 'WASD / arrows move · E work the plot in front of you · 1-4 pick a seed',
      howTo: 'Till, plant, water and harvest, then sell at the stand. Reach the season goal before the day ends. Ask bots to help and they work your plots.',
      passes: [['sprinkler', 'Sprinklers', 350, 'Planted crops water themselves.', 'wave'], ['fertilizer', 'Fertilizer', 300, 'Crops grow 35% faster.', 'sparkle'], ['big_basket', 'Market Stall', 250, 'Sell every harvest for 25% more.', 'wallet']],
    },
    restaurant: {
      genre: 'Tycoon', cats: ['Social'], maxPlayers: 10, bots: 3,
      badges: [['goal', 'Five Stars', 'Hit the shift goal.', 'trophy'], ['rush', 'Rush Hour Hero', 'Serve 12 orders in one shift.', 'bolt'], ['perfect', 'Perfect Shift', 'Finish a shift without an angry customer.', 'heart']],
      lb: [lb('bestShift', 'Best Shift'), lb('served', 'Orders Served'), lb('wins', 'Goals Hit')],
      controls: 'WASD / arrows move · E pick up / drop at a station · Q bin what you hold',
      howTo: 'Read the order above each customer, collect the ingredients from the stations in order, cook what needs cooking, and serve before their patience runs out.',
      passes: [['fast_hands', 'Fast Hands', 300, 'Move 20% faster in the kitchen.', 'run'], ['patient', 'Comfy Chairs', 300, 'Customers wait 30% longer.', 'heart'], ['tip_jar', 'Tip Jar', 250, 'Tips are 50% bigger.', 'wallet']],
    },
    flight: {
      genre: 'Racing', cats: ['Adventure'], maxPlayers: 12, bots: 5,
      badges: [['win', 'Top Gun', 'Finish first.', 'trophy'], ['rings', 'Ring Master', 'Fly through every ring on a course.', 'target'], ['nohit', 'Smooth Flyer', 'Finish without crashing.', 'sparkle']],
      lb: [lb('bestScore', 'Best Score'), lb('wins', 'Wins'), lb('ringsHit', 'Rings')],
      controls: 'WASD / arrows steer · Shift boost · Space special',
      howTo: 'Fly through the rings, dodge the obstacles and use boost wisely. Every ring adds points and time; finish first to win.',
      passes: [['turbo', 'Turbo Tank', 300, 'Boost refills 50% faster.', 'rocket'], ['wide_rings', 'Ring Magnet', 300, 'Rings count from farther away.', 'target'], ['glider', 'Glider Wings', 250, 'Steer 25% faster.', 'wave']],
    },
    golf: {
      genre: 'Sports', cats: ['Puzzle'], maxPlayers: 8, bots: 3,
      badges: [['win', 'Club Champion', 'Beat everyone over a full round.', 'trophy'], ['ace', 'Hole in One', 'Sink a hole in one shot.', 'star'], ['under', 'Under Par', 'Finish a round under par.', 'flag']],
      lb: [lb('bestRound', 'Best Round', 'asc'), lb('wins', 'Wins'), lb('aces', 'Holes in One')],
      controls: 'A / D aim · Hold Space for power, release to putt · R reset ball (+1)',
      howTo: 'Six holes. Aim, charge your putt and sink the ball in as few strokes as you can. Lowest total wins.',
      passes: [['aim_guide', 'Aim Guide', 300, 'Shows where your putt will bounce.', 'target'], ['mulligan', 'Mulligan', 250, 'Take back one bad putt per hole.', 'refresh'], ['sticky', 'Grippy Ball', 250, 'Your ball stops faster on slopes and syrup.', 'target']],
    },
    spooky: {
      genre: 'Horror', cats: ['Survival', 'Adventure'], maxPlayers: 8, bots: 3,
      badges: [['escape', 'Escape Artist', 'Escape with the exit unlocked.', 'door'], ['ghost', 'Never Seen', 'Escape without being spotted.', 'eyeOff'], ['team', 'Nobody Left Behind', 'Escape with every teammate.', 'users']],
      lb: [lb('wins', 'Escapes'), lb('bestEscape', 'Fastest Escape', 'asc', 'time'), lb('found', 'Items Found')],
      controls: 'WASD / arrows move · E pick up / hide · Shift sneak',
      howTo: 'Find every item on the list, then reach the exit. Stay out of the light and the monster\'s sight, hide in lockers when it hunts you.',
      passes: [['flashlight', 'Big Flashlight', 300, 'A wider, longer torch beam.', 'sun'], ['sneakers', 'Quiet Sneakers', 300, 'Sneak at full speed.', 'run'], ['extra_life', 'Lucky Charm', 350, 'One extra life per night.', 'heart']],
    },
    quiz: {
      genre: 'Puzzle', cats: ['Social'], maxPlayers: 16, bots: 7,
      badges: [['win', 'Big Brain', 'Win a quiz.', 'trophy'], ['perfect', 'Flawless', 'Answer every question right.', 'star'], ['fast', 'Quick Thinker', 'Answer 5 questions in the first 3 seconds.', 'bolt']],
      lb: [lb('wins', 'Wins'), lb('bestScore', 'Best Score'), lb('correct', 'Correct Answers')],
      controls: 'WASD / arrows move onto an answer pad',
      howTo: 'Read the question and stand on the right answer before time runs out. Wrong pads drop away. Fast right answers score more.',
      passes: [['fifty', '50/50', 350, 'Two wrong answers light up red on every third question.', 'target'], ['extra_time', 'Extra Time', 250, '+3 seconds on every question.', 'clock'], ['second_chance', 'Second Chance', 300, 'Survive one wrong answer per quiz.', 'heart']],
    },
  };

  /**
   * [id, name, type, variant, studio, popularity, approval, created, tagline, description, [own passes], [chat any], [extra category]]
   * Own passes: [key, name, price, desc, effect, icon]; effects are handled by the engine.
   */
  const GAMES = [
    // ---- runner
    ['metro-dash', 'Metro Dash', 'runner', 'metro', 'Rushline Games', 0.82, 0.9, '2022-05-14', 'Dodge trains. Grab coins. Never stop.', 'Sprint through a busy train yard at sunset. Weave between trains barrelling down the tracks, hop barriers, slide under signals and collect every coin. The yard gets faster the longer you last.', ['train incoming!!', 'left lane is a trap', 'i swear that train came out of nowhere', 'magnet run lets go', 'my record is like 2k'], ['Action']],
    ['lava-escape', 'Lava Escape', 'runner', 'lava', 'Emberpeak Studio', 0.62, 0.87, '2023-10-02', 'Run. The floor is actually lava.', 'The volcano is erupting and a wall of lava is racing down the canyon behind you. Trip on a rock and it gains ground; trip twice and it is over. Leap the lava channels and do not look back.', ['the lava is SO close', 'dont trip dont trip', 'that jump was insane', 'who else keeps tripping on rocks'], ['Survival']],
    ['jungle-sprint', 'Jungle Sprint', 'runner', 'jungle', 'Canopy Works', 0.58, 0.88, '2022-08-19', 'The temple wants its idol back.', 'You grabbed the golden idol and the temple is crumbling. Dash through ancient ruins, leap the crumbling gaps, duck the hanging vines and find every coin the explorers left behind.', ['gaps everywhere lol', 'duck the vines', 'the idol was not worth it', 'ok this ruin is beautiful tho'], ['Adventure']],
    ['sugar-sprint', 'Sugar Sprint', 'runner', 'candy', 'Sugarcube Studio', 0.66, 0.91, '2024-02-10', 'Bounce on gumdrops, rain coins.', 'A sprint through candy land. Hit the gumdrop pads to launch into the clouds where the coins are thickest, dodge licorice barriers and gummy walls, and ride the sugar rush as far as it goes.', ['GUMDROP PAD', 'sky coins are the best', 'this game makes me hungry', 'bouncy bouncy'], []],
    ['hyperlane', 'Hyperlane', 'runner', 'hyper', 'Rushline Games', 0.55, 0.89, '2025-01-22', 'Neon lasers. Light speed.', 'A glowing track through deep space. Time your runs through blinking laser gates, hit boost pads for light speed bursts and chase the leaderboard in the fastest runner on BlockForge.', ['laser timing is everything', 'boost pad chain lets gooo', 'so pretty in here', 'my eyes cant keep up'], ['Racing']],
    // ---- party
    ['party-palooza', 'Party Palooza', 'party', 'palooza', 'Confetti Cannon', 0.88, 0.92, '2021-12-03', 'Five minigames. One champion.', 'The biggest party on BlockForge: every round is a different minigame, from Color Block to Meteor Dodge to Sumo. Survive, score points and be crowned the Party Champion.', ['whats the next minigame', 'color block is my specialty', 'i got shoved off AGAIN', 'party time!!', 'sumo round lets gooo'], ['Action']],
    ['color-craze', 'Color Craze', 'party', 'color', 'Confetti Cannon', 0.61, 0.88, '2022-07-07', 'Find the color before the floor drops.', 'A color is called, the countdown starts, and every other tile falls away. Each round gets faster. Keep your eyes on the floor and your feet on the right color.', ['PINK PINK PINK', 'i always forget which one is teal', 'faster rounds are brutal', 'color blind mode when'], ['Puzzle']],
    ['hexfall', 'Hexfall', 'party', 'hexfall', 'Confetti Cannon', 0.57, 0.89, '2023-03-18', 'Every step you take, the floor falls.', 'Three layers of tiles over the void, and every tile crumbles a moment after you step on it. Keep moving, plan your path and be the last one standing.', ['dont stop moving', 'bottom layer is scary', 'i fell through three floors lol', 'ok who ate my tiles'], ['Action']],
    ['meteor-mayhem', 'Meteor Mayhem', 'party', 'meteor', 'Boulder Bros', 0.49, 0.86, '2022-11-11', 'Watch the shadows. Dodge the sky.', 'Meteors rain down on a shrinking island. Watch their shadows grow, dodge the impacts and outlast everyone as the storm speeds up.', ['shadow shadow shadow', 'that one was huge', 'the island is so small now', 'meteor went right past me'], ['Survival']],
    ['sumo-smash', 'Sumo Smash', 'party', 'sumo', 'Boulder Bros', 0.52, 0.87, '2023-06-30', 'Push. Shove. Stay on.', 'A round platform, a crowd of players and one rule: do not fall off. Shove your rivals over the edge, hold the golden hill for points and survive the shrinking ring.', ['SHOVE', 'who pushed me', 'king of the hill is mine', 'heavyweight pass is op'], ['Fighting']],
    // ---- tag
    ['freeze-frenzy', 'Freeze Frenzy', 'tag', 'freeze', 'Tagteam Studio', 0.6, 0.88, '2022-02-14', 'Frozen friends need a high five.', 'Freeze tag on a snowy playground. The taggers freeze everyone they touch; touch a frozen teammate to set them free. Keep at least one runner moving until the whistle.', ['unfreeze me pls', 'im coming for you', 'tagger is so fast', 'last runner standing!!'], []],
    ['infection-tag', 'Infection Tag', 'tag', 'infection', 'Tagteam Studio', 0.65, 0.87, '2022-09-09', 'One goes green. Then everyone does.', 'One player starts infected. Every tag spreads it. Survive until the timer ends, or if you get infected, help turn the whole server green.', ['run run run', 'im infected come here', 'hide behind the slides', 'only 2 left!'], ['Survival']],
    ['hide-and-sneak', 'Hide & Sneak', 'tag', 'hide', 'Hideout Games', 0.8, 0.91, '2021-06-25', 'Stay in the shadows. Stay quiet.', 'The seeker has a flashlight and a very good memory. Hide behind furniture, sneak between rooms and stay out of the beam until time runs out. Getting spotted means they are coming.', ['best hiding spot ever', 'i can see your hat lol', 'shhh', 'seeker went left'], ['Horror']],
    ['flag-wars', 'Flag Wars', 'tag', 'flag', 'Hideout Games', 0.54, 0.86, '2023-01-28', 'Grab their flag. Guard yours.', 'Red against blue. Sneak into enemy land, grab their flag and run it home while they chase you. Tag intruders in your half to send them back. First team to three wins.', ['they have our flag!', 'defense defense', 'going for the flag', 'nice capture!!'], ['Strategy']],
    ['hot-potato-panic', 'Hot Potato Panic', 'tag', 'potato', 'Tagteam Studio', 0.47, 0.85, '2024-04-12', 'Pass the bomb before it blows.', 'Someone is holding a ticking potato. Tag another player to pass it on. When the timer hits zero, whoever holds it is out. Last player standing wins.', ['HOT HOT HOT', 'take it take it', 'why always me', 'the timer is lying'], ['Action']],
    // ---- fishing
    ['lakeside-lures', 'Lakeside Lures', 'fishing', 'lake', 'Reel Deal Games', 0.64, 0.92, '2021-09-04', 'A quiet lake. A legendary carp.', 'A peaceful lake with a wooden dock, rustling reeds and a legend: the Golden Carp. Cast, strike and reel in trout, bass and pike, fill your bucket and chase the big one.', ['nice catch!', 'something big just bit', 'golden carp is a myth', 'so relaxing here'], ['Adventure']],
    ['ice-hole-fishing', 'Ice Hole Fishing', 'fishing', 'ice', 'Coldfront Co.', 0.43, 0.87, '2023-12-15', 'Crack the ice. Catch the cold ones.', 'Fishing through a hole in a frozen lake. Arctic char and ice pike lurk below, but the hole keeps freezing over: crack it open again before your line gets stuck.', ['my hole froze again', 'brrr', 'ice pike!!', 'cozy but cold'], ['Survival']],
    ['deep-sea-legends', 'Deep Sea Legends', 'fishing', 'deep', 'Reel Deal Games', 0.75, 0.9, '2022-03-26', 'Big boat. Bigger fish.', 'Head out to the open ocean on a fishing boat. Tuna, swordfish and sharks put up a real fight, and a shark will steal your catch if you reel too slowly.', ['shark stole my fish', 'SWORDFISH', 'this rod cant handle it', 'deep sea is where the money is'], ['Adventure']],
    ['magma-fishing', 'Magma Fishing', 'fishing', 'lava', 'Emberpeak Studio', 0.41, 0.86, '2024-07-20', 'Fish that swim in fire.', 'Cast a heat-proof line into a lake of molten rock. Ember eels and obsidian bass are hot to handle: your heat meter climbs while you reel, so land them fast.', ['my line is on fire', 'obsidian bass lets go', 'heat meter almost maxed', 'this is so cursed i love it'], ['Survival']],
    ['koi-garden', 'Koi Garden', 'fishing', 'koi', 'Reel Deal Games', 0.39, 0.93, '2024-10-05', 'Rare colors. Calm waters.', 'A zen garden pond full of koi in every color. Scatter food to draw the rare ones close, catch them gently and complete your collection. No rush, no sharks.', ['so peaceful', 'i need the platinum one', 'feeding time', 'this is my happy place'], ['Social']],
    // ---- farm
    ['harvest-valley', 'Harvest Valley', 'farm', 'valley', 'Greenacre Interactive', 0.72, 0.91, '2021-04-17', 'Plant it, grow it, sell it.', 'Your own little farm in a sunny valley. Till the soil, plant carrots, corn, tomatoes and berries, water them, harvest and sell at the market stand. Hit the season goal before sundown.', ['carrots are the best money', 'dont forget to water', 'my corn is almost ready', 'farm life is the life'], ['Simulator']],
    ['pumpkin-patch', 'Pumpkin Patch Tycoon', 'farm', 'pumpkin', 'Greenacre Interactive', 0.48, 0.88, '2023-09-23', 'Grow the biggest pumpkin in town.', 'An autumn farm where everything is about pumpkins. Grow them big, keep the crows off your patch and harvest a golden prize pumpkin for the fair.', ['crows again!!', 'my pumpkin is huge', 'golden pumpkin spotted', 'autumn vibes'], ['Simulator']],
    ['star-greenhouse', 'Star Greenhouse', 'farm', 'space', 'Starseed Labs', 0.44, 0.87, '2024-05-30', 'Farming, but on the Moon.', 'A glass dome on the Moon. Grow moon melons and star fruit in low gravity, keep the oxygen pumps humming and sell your crops to the orbital market.', ['moon melons are wild', 'gravity is so floaty', 'star fruit sells for so much', 'space farming hits different'], ['Adventure']],
    ['honey-hive', 'Honey Hive', 'farm', 'honey', 'Pollen Pals', 0.78, 0.9, '2022-06-18', 'Your bees, your flowers, your honey.', 'Walk through fields of flowers with your bee swarm, collect pollen, and bring it back to the hive to make honey. Plant new flowers and grow a swarm big enough to reach the golden honey goal.', ['my bees are so cute', 'pink flowers give more pollen', 'hive is full go go go', 'bzzzz'], ['Simulator']],
    ['mushroom-grove', 'Mushroom Grove', 'farm', 'mushroom', 'Greenacre Interactive', 0.36, 0.89, '2025-03-08', 'Glowing mushrooms by moonlight.', 'A night-time forest farm where mushrooms glow. Grow glowcaps and moon morels in the shade, keep the slugs away, and harvest a golden truffle if you are lucky.', ['slugs are the worst', 'glowcaps look so good at night', 'truffle hunting', 'spooky but cozy'], ['Adventure']],
    // ---- restaurant
    ['pizza-rush', 'Pizza Rush', 'restaurant', 'pizza', 'Kitchen Chaos Co.', 0.85, 0.91, '2021-02-27', 'Dough, sauce, cheese, go!', 'The busiest pizza place in town. Stretch the dough, add sauce, cheese and toppings, bake it in the oven without burning it and get it to the counter before the customer storms out.', ['pepperoni again??', 'oven is full', 'dont burn it!!', 'this shift is chaos'], ['Social']],
    ['burger-blitz', 'Burger Blitz', 'restaurant', 'burger', 'Kitchen Chaos Co.', 0.68, 0.89, '2022-04-08', 'Stack it right. Serve it hot.', 'A diner on rush hour. Grill the patties, stack buns, cheese, lettuce and tomato in the right order and slide the burger across before the line gets angry.', ['grill is on fire lol', 'who wanted no pickles', 'stack it right', 'rush hour!!'], ['Simulator']],
    ['sushi-spin', 'Sushi Spin', 'restaurant', 'sushi', 'Wasabi Works', 0.46, 0.9, '2023-07-15', 'Roll it. Plate it. Send it round.', 'A sushi counter with a conveyor belt. Roll rice, fish and seaweed into the right sushi, plate it and send it spinning to the right seat. Customers are picky but tip well.', ['salmon roll up', 'belt is so fast', 'wasabi overload', 'i love this game'], ['Puzzle']],
    ['scoop-shop', 'Scoop Shop', 'restaurant', 'icecream', 'Sugarcube Studio', 0.53, 0.92, '2023-05-20', 'Scoop fast before it melts.', 'Summer at the ice cream stand. Pick a cone or cup, stack the right scoops and toppings and serve before it melts. The heat makes everyone impatient.', ['it melted', 'triple scoop!', 'mint is underrated', 'sprinkles on everything'], ['Social']],
    ['taco-truck', 'Taco Truck Tycoon', 'restaurant', 'taco', 'Kitchen Chaos Co.', 0.42, 0.87, '2024-08-01', 'Tortilla, filling, salsa, sold.', 'A tiny taco truck and a huge line. Warm the tortillas, add the filling, salsa and toppings, and serve fast. Great shifts grow your truck.', ['extra salsa pls', 'line is around the block', 'grill the tortillas', 'best taco truck ever'], ['Simulator']],
    // ---- flight
    ['sky-rings', 'Sky Rings', 'flight', 'rings', 'Skyward Works', 0.63, 0.9, '2021-08-12', 'Glide through every golden ring.', 'Glide over floating islands and through golden rings. Each ring adds points and speed, balloons and rocks get in the way, and the fastest glider takes the crown.', ['ring streak!!', 'this view is amazing', 'boost boost', 'missed one ugh'], ['Adventure']],
    ['wingsuit-canyon', 'Wingsuit Canyon', 'flight', 'wingsuit', 'Canopy Works', 0.56, 0.88, '2022-10-21', 'Dive the canyon. Thread the rings.', 'Jump off the cliff in a wingsuit and dive down a narrow canyon, threading rings between rock arches. It is fast, it is tight and one wrong turn ends the run.', ['so fast', 'the arches are tight', 'wingsuit gang', 'i clipped the wall lol'], ['Action']],
    ['dragon-riders', 'Dragon Riders', 'flight', 'dragon', 'Wyrmwing Games', 0.74, 0.91, '2022-12-17', 'Ride a dragon. Pop the balloons.', 'Saddle up and ride a dragon through the clouds. Fly through rings, breathe fire to pop target balloons and race the other riders to the castle.', ['FIRE BREATH', 'my dragon is the fastest', 'balloon combo', 'dragons are the best'], ['Adventure']],
    ['jet-stunt-league', 'Jet Stunt League', 'flight', 'jet', 'Skyward Works', 0.45, 0.86, '2024-01-13', 'Boost gates. Tight turns. Big scores.', 'A stunt course for jet packs above the city. Chain boost gates for multipliers, dodge the cranes and billboards and land the highest score of the league.', ['boost gate combo', 'nearly hit that crane', 'league finals lets go', 'jetpack is so loud'], ['Racing']],
    ['paper-plane-pro', 'Paper Plane Pro', 'flight', 'paper', 'Foldcraft', 0.38, 0.92, '2025-02-06', 'A paper plane in a giant house.', 'You are a paper plane loose in a giant house. Ride the fan breezes, glide through the rooms, sail through rings made of tape and land on the fridge for the win.', ['the fan saved me', 'kitchen is the hardest room', 'so cute', 'landed on the fridge!'], ['Puzzle']],
    // ---- golf
    ['mini-golf-mania', 'Mini Golf Mania', 'golf', 'classic', 'Tee Time Games', 0.6, 0.9, '2021-07-24', 'Six holes. Windmills included.', 'Classic mini golf with bank shots, sand traps, water hazards and of course a windmill. Aim, charge your putt and beat the other players to the lowest score.', ['hole in one!!', 'the windmill hates me', 'bank shot pro', 'sand trap again'], []],
    ['neon-putt', 'Neon Putt', 'golf', 'neon', 'Rushline Games', 0.44, 0.88, '2023-04-01', 'Glow-in-the-dark mini golf.', 'Mini golf under black light. Moving bumpers, glowing walls and ramps make every hole a light show. Bounce your way to the cup.', ['this looks so cool', 'bumper stole my shot', 'glow ball ftw', 'hole 4 is evil'], ['Action']],
    ['candy-course', 'Candy Course Golf', 'golf', 'candy', 'Tee Time Games', 0.4, 0.9, '2023-11-25', 'Putt through syrup and sprinkles.', 'Mini golf in candy land. Syrup slows your ball to a crawl, gumdrop bumpers bounce it around and the holes are made of donuts.', ['syrup is sticky lol', 'donut hole!', 'gumdrop bounce', 'so sweet'], ['Puzzle']],
    ['zero-g-golf', 'Zero-G Golf', 'golf', 'space', 'Starseed Labs', 0.37, 0.87, '2024-06-14', 'Low friction. High stakes.', 'Mini golf on an asteroid. Balls glide forever in low gravity, and gravity wells curve your shots around the planets. Precision is everything.', ['it wont stop rolling', 'gravity well assist', 'space golf is so hard', 'nailed it'], ['Adventure']],
    ['castle-putt', 'Castle Putt', 'golf', 'castle', 'Tee Time Games', 0.35, 0.89, '2025-04-19', 'Time the drawbridge. Sink the putt.', 'Mini golf in a medieval castle. Time your shots through the drawbridge, bank off the stone walls and avoid the moat to earn the royal trophy.', ['drawbridge timing', 'moat got me', 'royal trophy is mine', 'castle aesthetic is peak'], ['Strategy']],
    // ---- spooky
    ['nightshift-arcade', 'Nightshift Arcade', 'spooky', 'arcade', 'Lantern Hollow', 0.8, 0.9, '2021-10-29', 'The mascot still walks at night.', 'The arcade closed hours ago, but the mascot is still wandering the halls. Find the fuses, restore power to the exit door and get out before it catches you. Hide in the prize lockers when you hear it coming.', ['it saw me', 'hide in the locker!!', 'found a fuse', 'this game is so creepy'], ['Survival']],
    ['hollow-halls', 'Hollow Halls', 'spooky', 'halls', 'Lantern Hollow', 0.67, 0.88, '2022-10-14', 'Endless yellow hallways. Something else is here.', 'You woke up in a maze of yellow office hallways that hum and flicker. Collect the keycards, find the exit door and whatever you do, do not let the thing in the halls see you.', ['these halls never end', 'did anyone else hear that', 'keycard 3 where', 'running back to the exit'], ['Puzzle']],
    ['creaky-cottage', 'Creaky Cottage', 'spooky', 'cottage', 'Lantern Hollow', 0.59, 0.87, '2023-10-31', 'A grumpy ghost. A creaky house.', 'The old cottage on the hill has a grumpy ghost who hates visitors. Find the keys to the front door while it drifts through the walls. Creaky floorboards give you away.', ['the ghost went through the wall', 'floorboard creaked lol', 'got the attic key', 'grumpy ghost is kinda cute'], ['Adventure']],
    ['shadow-hotel', 'Shadow Hotel', 'spooky', 'hotel', 'Lantern Hollow', 0.5, 0.86, '2024-03-22', 'Check in. Try to check out.', 'A grand hotel where the lights flicker room to room. Search the rooms for the lost keys, dodge the shadow porter and find your way to the lobby door.', ['lights went out again', 'room 107 has something', 'porter is fast', 'checked out lets go'], ['Puzzle']],
    ['frostbite-station', 'Frostbite Station', 'spooky', 'frost', 'Coldfront Co.', 0.41, 0.85, '2025-01-09', 'Arctic base. Something big in the snow.', 'An arctic research base in a blizzard. Collect the generator parts to power the rescue beacon while something huge stomps between the buildings. Stay warm, stay hidden.', ['its so cold', 'heard stomping', 'beacon is online!', 'yeti or not yeti'], ['Survival']],
    // ---- quiz
    ['brain-blast', 'Brain Blast', 'quiz', 'trivia', 'Quizzly Games', 0.7, 0.9, '2021-05-06', 'Know it? Stand on it.', 'A live trivia show on floating platforms. Read the question, run to the right answer pad before the timer ends and watch the wrong ones drop. Fast answers score big.', ['i knew that one', 'wrong pad lol', 'this question is impossible', 'big brain time'], []],
    ['speed-math', 'Speed Math Showdown', 'quiz', 'math', 'Quizzly Games', 0.4, 0.88, '2022-09-01', 'Quick sums. Quicker feet.', 'Math questions flash on the board and you have seconds to solve them and reach the right pad. They get harder every round.', ['7 times 8 is 56 right', 'mental math champion', 'too fast!', 'calculator brain'], ['Action']],
    ['lab-coat-quiz', 'Lab Coat Quiz', 'quiz', 'science', 'Quizzly Games', 0.36, 0.89, '2023-02-17', 'Science questions, live on stage.', 'Planets, animals, the human body and chemistry: a science quiz show where the wrong answer pads fall away. Put on your lab coat and prove it.', ['science nerd here', 'the sun is a star!!', 'i learned something', 'chemistry question was hard'], []],
    ['world-tour-trivia', 'World Tour Trivia', 'quiz', 'world', 'Quizzly Games', 0.43, 0.9, '2024-02-29', 'Capitals, landmarks and oceans.', 'Travel the world on a quiz stage: capitals, continents, landmarks and oceans. Run to the right answer and stamp your passport.', ['capital of australia is tricky', 'passport stamped', 'geography king', 'i should have known that'], ['Adventure']],
    ['true-or-false-tower', 'True or False Tower', 'quiz', 'truefalse', 'Quizzly Games', 0.5, 0.87, '2024-09-12', 'Two pads. One is a trapdoor.', 'Every floor of the tower asks one question with two pads: TRUE or FALSE. Guess wrong and you drop a floor. Reach the top first.', ['true true true', 'trapdoor got me', 'false!!', 'the tower is so tall'], ['Action']],
  ];

  const CHAT = {
    runner: { start: ['lets run', 'go go go'], win: ['LAST ONE RUNNING', 'gg ez run'], lose: ['wiped out lol', 'that train came from nowhere'] },
    party: { start: ['party time', 'good luck all'], win: ['PARTY CHAMPION', 'gg everyone!'], lose: ['so close', 'rematch?'] },
    tag: { start: ['run!!', 'here we go'], win: ['survived!', 'gg'], lose: ['got me', 'unfair lol'] },
    fishing: { start: ['lines in', 'good luck fishing'], win: ['nice haul', 'full bucket'], lose: ['it got away', 'next time'] },
    farm: { start: ['lets farm', 'seeds ready'], win: ['market day!', 'goal reached'], lose: ['not enough crops', 'next season'] },
    restaurant: { start: ['orders up', 'kitchen open'], win: ['five stars!', 'great shift'], lose: ['too many angry customers', 'rough shift'] },
    flight: { start: ['takeoff!', 'wings out'], win: ['first place!', 'top gun'], lose: ['crashed lol', 'so close'] },
    golf: { start: ['fore!', 'good luck'], win: ['club champion', 'under par!'], lose: ['too many strokes', 'that windmill'] },
    spooky: { start: ['stay together', 'im scared already'], win: ['WE ESCAPED', 'made it out!'], lose: ['it got me', 'nope nope nope'] },
    quiz: { start: ['brain on', 'good luck'], win: ['big brain', 'too easy'], lose: ['i knew that one', 'rigged lol'] },
  };

  for (const [id, name, type, variant, creator, pop, approval, created, tagline, description, chatAny, cats] of GAMES) {
    const t = TYPE[type];
    const visits = Math.round(Math.pow(pop, 2.1) * 42000000 + 180000);
    BF.registerGame({
      id, name, gameType: type, genre: t.genre, categories: (t.cats || []).concat(cats || []),
      // the second wave draws a little smaller crowds than the originals
      creator, maxPlayers: t.maxPlayers, activeBots: t.bots, popularity: +(pop * 0.86).toFixed(3), approval,
      baseVisits: visits, baseFavorites: Math.round(visits * 0.018), baseLikes: Math.round(visits * 0.022),
      createdAt: created, updatedAt: '2026-09-' + String(10 + (id.length % 15)).padStart(2, '0'), ageRating: type === 'spooky' ? '9+' : 'All Ages',
      tagline, description, howTo: t.howTo, controls: t.controls,
      config: { variant },
      passes: t.passes.map((p, i) => pass('gp_' + id + '_' + p[0], p[1], p[2] + (i === 0 ? Math.round(pop * 100) : 0), p[3], p[0], p[4])),
      badges: t.badges.map((b) => badge(id + '_' + b[0], b[1], b[2], b[3])),
      leaderboard: t.lb,
      chat: Object.assign({ any: chatAny }, CHAT[type]),
      changelog: [{ v: '1.' + (3 + (id.length % 6)), date: '2026-09-' + String(10 + (id.length % 15)).padStart(2, '0'), notes: 'Balance and performance improvements.' }, { v: '1.0', date: created, notes: name + ' launches on BlockForge.' }],
    });
    const g = BF.GAME_REGISTRY.find((x) => x.id === id);
    for (const p of [
      pass('gp_' + id + '_vip', 'VIP', 800, 'VIP in ' + name + ': +50% ForgeCoins and XP from every session, and a gold VIP tag in chat.', 'vip', 'crown'),
      pass('gp_' + id + '_trail', 'Sparkle Trail', 150, 'Leave a trail of glitter behind you wherever you go in ' + name + ' (3D).', 'trail', 'sparkle'),
    ]) { p.gameId = id; p.kind = 'pass'; g.passes.push(p); }
  }

  /** Engine per new game type (for tests and tools). */
  BF.GAME_TYPES_V2 = Object.keys(TYPE);
})((window.BF = window.BF || {}));
