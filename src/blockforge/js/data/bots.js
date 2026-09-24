/**
 * BlockForge — bot population data: names, personalities and the local
 * dialogue tables used by BF.dialogue. Every bot is fictional.
 */
(function (BF) {
  'use strict';

  /**
   * Personality archetypes. `accept` = chance to accept a friend request,
   * `chatty` scales chat frequency, `skill` = [min, max] gameplay skill.
   */
  BF.PERSONALITIES = {
    competitive: { label: 'Competitive', color: '#ff5a6a', accept: 0.55, chatty: 1.0, skill: [0.65, 0.95], icon: 'trophy', blurb: 'Plays to win and says so.' },
    friendly: { label: 'Friendly', color: '#3fd08a', accept: 0.97, chatty: 1.2, skill: [0.4, 0.75], icon: 'smile', blurb: 'Welcomes everyone to the server.' },
    explorer: { label: 'Explorer', color: '#46a8ff', accept: 0.8, chatty: 0.9, skill: [0.45, 0.8], icon: 'compass', blurb: 'Finds every hidden corner.' },
    collector: { label: 'Collector', color: '#ffb52e', accept: 0.72, chatty: 0.9, skill: [0.4, 0.75], icon: 'gem', blurb: 'Lives for rare items and pickups.' },
    chaotic: { label: 'Chaotic', color: '#b67cff', accept: 0.6, chatty: 1.5, skill: [0.3, 0.8], icon: 'bolt', blurb: 'Unpredictable, loud and fun.' },
    beginner: { label: 'Beginner', color: '#9aa5b5', accept: 0.92, chatty: 1.1, skill: [0.15, 0.45], icon: 'sparkle', blurb: 'New to BlockForge and full of questions.' },
  };

  /** Hand-authored bots (stable ids). The first eight start as your friends. */
  BF.BOT_SEEDS = [
    ['PixelRider', 'Pixel Rider', 'competitive', 38],
    ['NovaBuilder', 'Nova Builder', 'friendly', 44],
    ['CrimsonCube', 'Crimson Cube', 'chaotic', 21],
    ['ByteKnight', 'Byte Knight', 'competitive', 57],
    ['ShadowBlocks', 'Shadow Blocks', 'explorer', 33],
    ['LunaCraft', 'Luna Craft', 'friendly', 29],
    ['TurboFox', 'Turbo Fox', 'competitive', 41],
    ['EchoStar', 'Echo Star', 'collector', 36],
    ['BlockBuilder', 'Block Builder', 'friendly', 52],
    ['MysticMaple', 'Mystic Maple', 'explorer', 19],
    ['ZippyNova', 'Zippy Nova', 'beginner', 4],
    ['IronPebble', 'Iron Pebble', 'collector', 47],
    ['QuantumQuill', 'Quantum Quill', 'explorer', 26],
    ['FrostByte', 'Frost Byte', 'competitive', 63],
    ['SunnySprocket', 'Sunny Sprocket', 'friendly', 15],
    ['GlitchGoblin', 'Glitch Goblin', 'chaotic', 31],
    ['CometKid', 'Comet Kid', 'beginner', 3],
    ['JadeJuniper', 'Jade Juniper', 'collector', 40],
    ['VoltViper', 'Volt Viper', 'competitive', 49],
    ['MapleMarble', 'Maple Marble', 'beginner', 6],
    ['BlockMasterFan', 'BlockMaster Fan', 'beginner', 8],
    ['CinderMoth', 'Cinder Moth', 'explorer', 27],
  ];

  BF.BOT_PREFIXES = ['Pixel', 'Nova', 'Crimson', 'Byte', 'Shadow', 'Luna', 'Turbo', 'Echo', 'Frost', 'Blaze', 'Quantum', 'Neon', 'Sky', 'Iron', 'Storm', 'Mystic', 'Cosmo', 'Rusty', 'Sunny', 'Glitch', 'Hyper', 'Zippy', 'Pebble', 'Ember', 'Aqua', 'Volt', 'Onyx', 'Jade', 'Maple', 'Comet', 'Cobalt', 'Velvet', 'Arctic', 'Solar', 'Lunar', 'Rocket', 'Pocket', 'Tiny', 'Mega', 'Ultra', 'Silver', 'Golden', 'Cloud', 'Thunder', 'Crystal', 'Dusk', 'Dawn', 'Orbit', 'Pumpkin', 'Waffle', 'Noodle', 'Pickle', 'Mango', 'Cactus', 'Marble', 'Fuzzy', 'Clever', 'Brave', 'Swift', 'Copper', 'Maple', 'Honey', 'Indigo', 'Scarlet', 'Mint', 'Nimbus', 'Zen', 'Rogue', 'Sprout', 'Biscuit'];
  BF.BOT_SUFFIXES = ['Rider', 'Builder', 'Cube', 'Knight', 'Blocks', 'Craft', 'Fox', 'Wolf', 'Ninja', 'Wizard', 'Pilot', 'Miner', 'Racer', 'Hunter', 'Gamer', 'Bytes', 'Blade', 'Star', 'Spark', 'Dash', 'Hopper', 'Smith', 'Panda', 'Tiger', 'Otter', 'Falcon', 'Golem', 'Sprite', 'Scout', 'Ranger', 'Drifter', 'Voyager', 'Chef', 'Bard', 'Maker', 'Tinker', 'Nomad', 'Paws', 'Bean', 'Toast', 'Loop', 'Shard', 'Quest', 'Beacon', 'Penguin', 'Owl', 'Moth', 'Kitten', 'Dragon', 'Llama'];

  BF.BOT_BIOS = {
    competitive: ['Top of the {game} leaderboard. Come get me.', 'I do not lose. I learn. Then I win.', 'Ranked grinder. 1v1s welcome.', 'GG only if you earn it.'],
    friendly: ['Always happy to help new players! Add me :)', 'Here for good vibes and great games.', 'Say hi if you see me in {game}!', 'Building, playing, and making friends.'],
    explorer: ['Collecting secrets from every corner of BlockForge.', 'If there is a hidden room, I have probably found it.', 'Map maker. Cave diver. Sky walker.', 'Currently exploring {game}.'],
    collector: ['{n} rare items and counting.', 'Shop drops are my cardio.', 'Legendary hunter. Trades welcome.', 'Ask me about my hat collection.'],
    chaotic: ['i press buttons and things happen', 'professional button masher', 'if you see me running in circles, that is the strategy', 'bananas.'],
    beginner: ['new here!! how do i get forgecoins', 'just started, be nice pls', 'learning {game} one fall at a time', 'hi i am new'],
  };

  /**
   * Dialogue tables. `{game}` / `{name}` / `{item}` placeholders are filled in by
   * BF.dialogue. Game-specific lines live on each game's `chat` field.
   */
  BF.DIALOGUE = {
    greet: {
      competitive: ['sup', 'yo', 'hey. ready to lose?', 'o/'],
      friendly: ['hi!! :)', 'hey there!', 'welcome!', 'hiii', 'hello friend!'],
      explorer: ['hey! found anything cool?', 'hello!', 'hi, been here long?'],
      collector: ['hi! nice outfit', 'hey, love the avatar', 'hello!'],
      chaotic: ['HELLO', 'hiiiiiiii', 'yo yo yo', 'AAAA hi'],
      beginner: ['hi', 'hello how do i play', 'hey'],
    },
    idle: {
      competitive: ['anyone good here?', '1v1 me', 'check the leaderboard, im on it', 'who is top score rn', 'this is too easy'],
      friendly: ['having fun everyone?', 'love this game', 'good luck all!', 'this server is so nice', 'if anyone needs help just ask :)'],
      explorer: ['theres a secret spot here i think', 'has anyone explored the far side?', 'i love how big this map is', 'found a cool view over here'],
      collector: ['just got a new hat', 'anyone trading?', 'the shop restocked i think', 'my inventory is almost full lol', 'who has the fire halo'],
      chaotic: ['lol', 'bananas', 'WHO TOUCHED MY STUFF', 'brb eating cereal', 'i am speed', 'weeeee'],
      beginner: ['how do i do this', 'wait what', 'is this the right way??', 'this is my first time', 'how do u get coins'],
    },
    join: {
      competitive: ['im here, relax', 'lets go'],
      friendly: ['hi everyone!', 'hello server :)'],
      explorer: ['hey all', 'hi'],
      collector: ['hey!', 'hi'],
      chaotic: ['IM HERE', 'guess who'],
      beginner: ['hi', 'hello?'],
    },
    leave: {
      competitive: ['gg im out', 'too easy, bye'],
      friendly: ['bye everyone! :)', 'gtg, gg!'],
      explorer: ['cya', 'off to explore somewhere else'],
      collector: ['bye!', 'gotta check the shop'],
      chaotic: ['BYE', 'poof'],
      beginner: ['bye', 'my mom says dinner'],
    },
    reply: {
      gg: ['gg!', 'gg wp', 'ggs', 'gg :)'],
      laugh: ['lol', 'haha', 'xD', 'lmao'],
      thanks: ['np!', 'no problem', 'anytime', 'yw'],
      question: ['idk', 'not sure tbh', 'i think so?', 'try the other side', 'maybe?'],
      bye: ['cya!', 'bye!', 'later', 'see ya'],
      nice: ['thanks!', 'ikr', 'right??', 'ty ty'],
      default: ['true', 'fr', 'ok', 'lol same', 'yeah', 'sounds good', 'hmm'],
    },
    friend: {
      competitive: ['maybe if you beat me', 'sure, but i wont go easy'],
      friendly: ['sure! add me :)', 'yes!! sending one now', 'of course!'],
      explorer: ['sure, we can explore together', 'ok!'],
      collector: ['sure! nice avatar btw', 'ok'],
      chaotic: ['FRIENDSHIP ACTIVATED', 'ok lol'],
      beginner: ['yes pls!', 'ok!! my first friend'],
    },
    challenge: {
      competitive: ['youre on', 'bring it', 'easy win for me'],
      friendly: ['haha sure!', 'lets do it!'],
      explorer: ['ok but im slow lol', 'sure'],
      collector: ['sure', 'if i win i get bragging rights'],
      chaotic: ['LETS GOOOO', 'already started'],
      beginner: ['im not good but ok', 'how'],
    },
    help: {
      competitive: ['watch and learn', 'practice more'],
      friendly: ['sure! what do you need?', 'check the controls at the top of the screen :)'],
      explorer: ['try exploring near the edges', 'follow me'],
      collector: ['the shop has good stuff', 'ask me about items'],
      chaotic: ['have you tried jumping', 'no idea lol'],
      beginner: ['i need help too lol', 'same question'],
    },
    dmOpen: {
      competitive: ['rematch in {game}? i will win this time', 'saw your score in {game}. not bad. not good either', 'you up for {game}? loser buys the next pass'],
      friendly: ['hey! want to play {game} later? :)', 'hi! hope you are having a good day', 'thanks for playing with me earlier!'],
      explorer: ['did you know there is a hidden spot in {game}?', 'found a weird corner in {game}, come look', 'have you been to every island in Treasure Islands?'],
      collector: ['have you seen the {item} in the shop?', 'what is the rarest thing you own?', 'i just bought the {item}!!'],
      chaotic: ['i just fell off the map in {game} 10 times lol', 'hi. bye. hi again', 'CAN YOU HEAR THE MUSIC'],
      beginner: ['hi! how do i earn forgecoins faster?', 'how do daily rewards work?', 'can you show me how to play {game}?'],
    },
    dmReply: {
      competitive: ['whatever you say', 'we will see in game', 'ok', 'noted'],
      friendly: ['aww thanks!', 'haha yes!', 'sounds fun :)', 'totally!'],
      explorer: ['interesting...', 'ooh tell me more', 'cool!'],
      collector: ['nice!', 'what rarity?', 'cool cool'],
      chaotic: ['LOL', 'bananas', 'wait what', 'yes. no. maybe'],
      beginner: ['oh ok thanks', 'wow', 'i didnt know that'],
    },
    invite: ['wanna join me in {game}?', 'come play {game} with me!', 'join my {game} server?'],
  };

  /** System account used for platform messages. */
  BF.SYSTEM_SENDER = { id: 'system', username: 'BlockForge', displayName: 'BlockForge Team', system: true };
})((window.BF = window.BF || {}));
