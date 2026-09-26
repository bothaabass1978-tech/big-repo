/**
 * BlockForge — bot conversation engine.
 *
 * Turns whatever the player types into a reply that fits the bot, the place
 * (game chat or private messages) and what the bot remembers about the player.
 *
 *   parse(text)            normalise slang, find games / items / bots / maths
 *   think(bot, text, ctx)  pick an intent, run its handler, style the reply
 *   reply(bot, text, ctx)  async: the same decision, worded by Claude when the
 *                          published page can reach it (BF.ai), else local text
 *
 * A decision is {text, intent, facts[], goal, after?}. `after` is an action the
 * caller runs once the reply is shown (friend request, meeting the player in a
 * game, following back). Memory lives in state.chatmem[botId]: the player's
 * nickname, likes, dislikes and any open question the bot asked.
 */
(function (BF) {
  'use strict';

  const U = BF.util;

  // ------------------------------------------------------------ normalising

  const SLANG = {
    u: 'you', ur: 'your', ure: 'you are', "u're": 'you are', r: 'are', y: 'why', ya: 'you', yu: 'you',
    pls: 'please', plz: 'please', plss: 'please', thx: 'thanks', tysm: 'thank you so much', ty: 'thank you',
    wat: 'what', wut: 'what', wht: 'what', whats: 'what is', "what's": 'what is', wats: 'what is', "wat's": 'what is',
    whos: 'who is', "who's": 'who is', wheres: 'where is', "where's": 'where is', hows: 'how is', "how's": 'how is',
    thats: 'that is', "that's": 'that is', its: 'it is', "it's": 'it is', theres: 'there is', "there's": 'there is',
    wanna: 'want to', gonna: 'going to', gotta: 'got to', lemme: 'let me', gimme: 'give me', lets: 'let us', "let's": 'let us',
    im: 'i am', "i'm": 'i am', ima: 'i am going to', ive: 'i have', "i've": 'i have', ill: 'i will', "i'll": 'i will', id: 'i would', "i'd": 'i would',
    youre: 'you are', "you're": 'you are', youve: 'you have', "you've": 'you have', "you'll": 'you will',
    dont: 'do not', "don't": 'do not', doesnt: 'does not', "doesn't": 'does not', didnt: 'did not', "didn't": 'did not',
    cant: 'cannot', "can't": 'cannot', wont: 'will not', "won't": 'will not', isnt: 'is not', "isn't": 'is not',
    arent: 'are not', "aren't": 'are not', wasnt: 'was not', "wasn't": 'was not', shouldnt: 'should not', "shouldn't": 'should not',
    idk: 'i do not know', idc: 'i do not care', ikr: 'i know right', rn: 'right now', bc: 'because', cuz: 'because', coz: 'because', cause: 'because',
    ppl: 'people', rly: 'really', rlly: 'really', srsly: 'seriously', b4: 'before', gr8: 'great', m8: 'mate', tmrw: 'tomorrow', tmr: 'tomorrow',
    tho: 'though', thru: 'through', luv: 'love', yea: 'yeah', ye: 'yeah', yeh: 'yeah', yep: 'yes', yup: 'yes', nah: 'no', nope: 'no',
    k: 'ok', kk: 'ok', okay: 'ok', okie: 'ok', hru: 'how are you', wyd: 'what are you doing', wbu: 'what about you', hbu: 'how about you',
    omg: 'oh my gosh', fav: 'favorite', fave: 'favorite', favourite: 'favorite', favs: 'favorites', colour: 'color', colours: 'colors',
    bday: 'birthday', ngl: 'not gonna lie', tbh: 'to be honest', imo: 'in my opinion', btw: 'by the way', nvm: 'never mind',
    bruh: 'bruh', frfr: 'for real', fr: 'for real', lol: 'lol', lmao: 'lol', lmfao: 'lol', rofl: 'lol', xd: 'lol', haha: 'lol', hahaha: 'lol', hehe: 'lol',
    wassup: 'what is up', wasup: 'what is up', whatsup: 'what is up', sup: 'sup', gm: 'good morning', gn: 'good night',
    noob: 'noob', nub: 'noob', n00b: 'noob', ez: 'easy', gj: 'good job', wp: 'well played', ggs: 'gg', gg: 'gg',
    '1v1': '1v1', vs: 'versus', abt: 'about', smth: 'something', sth: 'something', dunno: 'do not know',
  };

  /** Normalise a message: lower case, slang expanded, stretched letters squashed. */
  function normalize(raw) {
    let t = String(raw || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"');
    t = t.replace(/([a-z])\1{2,}/g, '$1$1');
    const words = t.match(/[a-z0-9']+/g) || [];
    const out = [];
    for (let w of words) {
      w = w.replace(/^'+|'+$/g, '');
      if (!w) continue;
      if (/^(h+a+)+h?$|^(h+e+)+h?$/.test(w) && w.length >= 4) w = 'lol';
      if (/^l+o+l+$/.test(w)) w = 'lol';
      if (/^h+i+$/.test(w) || /^h+e+y+$/.test(w)) w = w[1] === 'i' ? 'hi' : 'hey';
      out.push(SLANG[w] || w);
    }
    return out.join(' ');
  }

  const has = (n, re) => re.test(n);
  const reWord = (s) => new RegExp('(^| )' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 's?( |$)');
  const aliasRe = new Map();
  function contains(n, phrase) {
    let re = aliasRe.get(phrase);
    if (!re) { re = reWord(phrase); aliasRe.set(phrase, re); }
    return re.test(n);
  }

  // ------------------------------------------------------------ entities

  const GAME_ALIASES = {
    'block-battlegrounds': ['battlegrounds', 'block battlegrounds', 'block battle', 'bb', 'arena game', 'pvp'],
    'skyline-racers': ['skyline', 'skyline racers', 'racers', 'racing', 'race game', 'cars', 'car game'],
    'treasure-islands': ['treasure islands', 'islands', 'treasure hunt', 'treasure island'],
    'towerfall-legends': ['towerfall', 'towerfall legends', 'tower defense', 'td', 'tower defence'],
    'pet-world': ['pet world', 'pet sim', 'pet simulator', 'pets game'],
    'sky-obby': ['obby', 'obbies', 'sky obby', 'parkour'],
    'city-life': ['city life', 'city', 'roleplay', 'rp'],
    'dungeon-frontier': ['dungeon', 'dungeons', 'dungeon frontier'],
    'elemental-clash': ['elemental', 'elemental clash', 'elements'],
    'zombie-outbreak': ['zombie', 'zombies', 'zombie outbreak', 'outbreak'],
    'factory-tycoon': ['factory', 'factory tycoon'],
    'treasure-tycoon': ['treasure tycoon', 'pirate tycoon'],
    'mega-miners': ['mega miners', 'miners', 'mining', 'mining game'],
    'battle-boats': ['battle boats', 'boats', 'ships', 'naval', 'boat game'],
    'pixel-soccer': ['pixel soccer', 'soccer', 'football'],
    'cosmic-survival': ['cosmic', 'cosmic survival', 'space game', 'asteroids', 'meteors'],
    'castle-siege': ['castle siege', 'castle', 'siege'],
    'speed-trials': ['speed trials', 'speed trial', 'time trials', 'time trial'],
    'pet-battle-arena': ['pet battle arena', 'pet battle', 'pet battles'],
    'mystery-mansion': ['mystery mansion', 'mansion', 'mystery', 'detective game'],
  };

  let gameIdx = null;
  let gameIdxKey = '';
  function gameIndex() {
    const list = BF.catalog ? BF.catalog.all() : BF.GAME_REGISTRY;
    const key = list.length + ':' + (list.length ? list[list.length - 1].id + list[list.length - 1].name : '');
    if (gameIdx && key === gameIdxKey) return gameIdx;
    const out = [];
    for (const g of list) {
      const names = new Set([g.name.toLowerCase().replace(/[^a-z0-9 ]/g, '')]);
      (GAME_ALIASES[g.id] || []).forEach((a) => names.add(a));
      for (const a of names) if (a.length >= 2) out.push({ alias: a, id: g.id });
    }
    out.sort((a, b) => b.alias.length - a.alias.length);
    gameIdx = out;
    gameIdxKey = key;
    return out;
  }

  function findGame(n) {
    for (const e of gameIndex()) if (contains(n, e.alias)) return BF.catalog ? BF.catalog.get(e.id) : BF.GAME_REGISTRY.find((g) => g.id === e.id);
    return null;
  }

  let itemIdx = null;
  function findItem(n) {
    if (!itemIdx) {
      itemIdx = BF.ITEM_LIST.map((it) => ({ alias: it.name.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9 ]/g, ''), it })).filter((e) => e.alias.length >= 4);
      itemIdx.sort((a, b) => b.alias.length - a.alias.length);
    }
    for (const e of itemIdx) if (contains(n, e.alias)) return e.it;
    return null;
  }

  const CATEGORY_WORDS = { hat: 'hat', hats: 'hat', hair: 'hair', hairstyle: 'hair', shirt: 'shirt', shirts: 'shirt', pants: 'pants', jacket: 'jacket', shoes: 'shoes', face: 'face', wings: 'back', cape: 'back', backpack: 'back', emote: 'emote', emotes: 'emote', necklace: 'neck', scarf: 'neck', outfit: 'outfit', avatar: 'outfit', skin: 'outfit', look: 'outfit' };

  function findBot(raw, n, pool) {
    const at = String(raw).match(/@([A-Za-z0-9_]{3,20})/);
    if (at) { const b = BF.bots.list.find((x) => x.username.toLowerCase() === at[1].toLowerCase()); if (b) return b; }
    for (const b of pool || []) {
      if (contains(n, b.username.toLowerCase()) || contains(n, b.displayName.toLowerCase())) return b;
    }
    return null;
  }

  // ------------------------------------------------------------ maths

  /** Evaluate + - * / ^ and parentheses. Returns null on anything else. */
  function evalMath(expr) {
    const toks = expr.match(/\d+(?:\.\d+)?|[-+*/^()]/g);
    if (!toks || toks.join('') !== expr.replace(/\s+/g, '')) return null;
    let i = 0;
    const peek = () => toks[i];
    const eat = () => toks[i++];
    function primary() {
      const t = eat();
      if (t === '(') { const v = sum(); if (eat() !== ')') throw new Error('paren'); return v; }
      if (t === '-') return -primary();
      if (t === '+') return primary();
      if (t == null || isNaN(+t)) throw new Error('bad');
      return +t;
    }
    function power() { let v = primary(); if (peek() === '^') { eat(); v = Math.pow(v, power()); } return v; }
    function product() {
      let v = power();
      while (peek() === '*' || peek() === '/') { const op = eat(); const r = power(); v = op === '*' ? v * r : v / r; }
      return v;
    }
    function sum() {
      let v = product();
      while (peek() === '+' || peek() === '-') { const op = eat(); const r = product(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    try {
      const v = sum();
      return i === toks.length && isFinite(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  function findMath(raw) {
    let s = String(raw).toLowerCase()
      .replace(/×/g, '*').replace(/÷/g, '/')
      .replace(/\bplus\b/g, '+').replace(/\bminus\b/g, '-').replace(/\b(times|multiplied by)\b/g, '*').replace(/\b(divided by|over)\b/g, '/')
      .replace(/(\d)\s*x\s*(?=\d)/g, '$1*').replace(/\bsquared\b/g, '^2').replace(/\bcubed\b/g, '^3');
    const m = s.match(/[-(]*\d[\d\s.+\-*/^()]*[\d)]/g);
    if (!m) return null;
    for (const cand of m) {
      const c = cand.trim();
      if (c.length > 60 || !/\d\s*[-+*/^]\s*[-(]*\d/.test(c)) continue;
      const v = evalMath(c);
      if (v == null) continue;
      const value = Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : Math.round(v * 1000) / 1000;
      return { expr: c.replace(/\s+/g, ' '), value };
    }
    return null;
  }

  // ------------------------------------------------------------ sentiment

  const POS = /\b(good|great|awesome|amazing|fine|happy|fun|cool|nice|love|excellent|fantastic|epic|wonderful|best|glad|excited|well|perfect|sweet|lit|fire)\b/;
  const NEG = /\b(bad|sad|terrible|awful|tired|bored|boring|angry|mad|upset|hate|worst|annoyed|lonely|scared|sick|meh|horrible|rough|stressed|nervous|not good|not great|not well)\b/;
  function sentiment(n) {
    const neg = NEG.test(n) || /\bnot (good|great|fun|happy)\b/.test(n);
    const pos = POS.test(n) && !/\bnot (good|great|fun|happy|cool|nice)\b/.test(n);
    return neg && !pos ? -1 : pos && !neg ? 1 : neg && pos ? 0 : 0;
  }

  // ------------------------------------------------------------ bot taste

  const TASTE = {
    color: ['red', 'blue', 'green', 'purple', 'orange', 'gold', 'teal', 'pink', 'black', 'white', 'neon green', 'sky blue', 'lime', 'crimson', 'silver'],
    food: ['pizza', 'tacos', 'sushi', 'pancakes', 'ice cream', 'noodles', 'burgers', 'mac and cheese', 'dumplings', 'waffles', 'fries', 'apples', 'cookies', 'ramen', 'strawberries'],
    animal: ['foxes', 'penguins', 'cats', 'dogs', 'otters', 'pandas', 'owls', 'axolotls', 'sharks', 'dolphins', 'red pandas', 'bunnies', 'frogs', 'capybaras'],
    music: ['chiptune', 'the Sky Obby theme', 'lo-fi beats', 'the Castle Siege drums', 'upbeat synth stuff', 'anything with a good beat'],
    season: ['summer', 'winter', 'fall', 'spring'],
    subject: ['art', 'science', 'math', 'music', 'gym', 'history', 'coding club'],
    sport: ['soccer', 'basketball', 'swimming', 'skateboarding', 'racing', 'tennis'],
    movie: ['anything with robots', 'space movies', 'funny animated ones', 'mystery movies'],
  };
  const TASTE_WORDS = {
    color: /\b(colou?rs?)\b/, food: /\b(foods?|snacks?|meals?|eat)\b/, animal: /\b(animals?|pets?)\b/, music: /\b(music|songs?|bands?)\b/,
    season: /\b(seasons?)\b/, subject: /\b(subjects?|class)\b/, sport: /\b(sports?)\b/, movie: /\b(movies?|films?|shows?)\b/,
  };

  function taste(bot, kind) {
    const pool = TASTE[kind];
    return pool ? pool[U.hash(bot.id + ':taste:' + kind) % pool.length] : null;
  }

  function favGame(bot) {
    const id = bot.favoriteGames && bot.favoriteGames[0];
    return (BF.catalog && BF.catalog.get(id)) || BF.GAME_REGISTRY.find((g) => g.id === id) || BF.GAME_REGISTRY[0];
  }

  function bestItem(bot) {
    let best = null;
    for (const id of Object.values((bot.avatar && bot.avatar.equipped) || {})) {
      const it = id && BF.ITEMS[id];
      if (it && it.cat !== 'animation' && it.cat !== 'emote' && (!best || BF.RARITY_ORDER.indexOf(it.rarity) > BF.RARITY_ORDER.indexOf(best.rarity))) best = it;
    }
    return best;
  }

  /** Stable opinion of a thing, -1..1. */
  function opinionOf(bot, key, game) {
    if (game) {
      if (bot.favoriteGames.includes(game.id)) return bot.favoriteGames[0] === game.id ? 1 : 0.8;
      const genreLove = { competitive: ['Fighting', 'Racing', 'Sports', 'Action'], explorer: ['Adventure', 'Puzzle', 'RPG', 'Obby'], collector: ['Simulator', 'Tycoon', 'RPG'], builder: ['Tycoon', 'Simulator', 'Strategy'], speedrunner: ['Obby', 'Racing'], roleplayer: ['Social', 'RPG', 'Adventure'], helper: ['Social', 'Simulator'], friendly: ['Social', 'Sports', 'Simulator'], chaotic: ['Action', 'Survival', 'Fighting'], beginner: ['Obby', 'Simulator', 'Social'] }[bot.personality] || [];
      if (genreLove.includes(game.genre)) return 0.6;
      if (bot.personality === 'beginner' && game.genre === 'Survival') return -0.3;
    }
    for (const kind of Object.keys(TASTE)) {
      const t = taste(bot, kind);
      if (t && (key === t || key.replace(/s$/, '') === t.replace(/s$/, ''))) return 1;
    }
    const h = (U.hash(bot.id + ':op:' + key) % 1000) / 1000;
    return h < 0.55 ? 0.6 : h < 0.85 ? 0.1 : -0.5;
  }

  // ------------------------------------------------------------ memory

  const SERIOUS = ['personal', 'ask_personal', 'scam', 'rude', 'feel_bad'];
  const SAFETY_FIXED = ['personal', 'ask_personal', 'scam', 'rude'];
  const MAX_MEMS = 80;
  function blankMem() {
    return { nick: null, likes: [], dislikes: [], pending: null, rude: 0, muteUntil: 0, talks: 0, first: 0, last: 0, used: [] };
  }

  function memory(bot) {
    const s = BF.store && BF.store.state;
    if (!s) return blankMem();
    const all = s.chatmem || {};
    return all[bot.id] || blankMem();
  }

  function remember(bot, fn) {
    if (!BF.store || !BF.store.state) return;
    BF.store.update('chatmem', (s) => {
      if (!s.chatmem || typeof s.chatmem !== 'object') s.chatmem = {};
      let m = s.chatmem[bot.id];
      if (!m) {
        m = s.chatmem[bot.id] = blankMem();
        m.first = BF.clock.now();
        const ids = Object.keys(s.chatmem);
        if (ids.length > MAX_MEMS) {
          ids.sort((a, b) => (s.chatmem[a].last || 0) - (s.chatmem[b].last || 0));
          for (const id of ids.slice(0, ids.length - MAX_MEMS)) if (id !== bot.id) delete s.chatmem[id];
        }
      }
      fn(m);
      if (m.likes.length > 10) m.likes.splice(0, m.likes.length - 10);
      if (m.dislikes.length > 10) m.dislikes.splice(0, m.dislikes.length - 10);
      if (m.used.length > 24) m.used.splice(0, m.used.length - 24);
    });
  }

  // ------------------------------------------------------------ templates

  /**
   * Pools by intent, then personality (`any` is the shared fallback).
   * `{name}` player, `{me}` bot, `{game}` game in play, `{fav}` bot's favourite
   * game, `{x}` the thing talked about, `{ans}` computed answer. A trailing
   * "|q:kind" marks a line that asks the player something the bot will
   * remember (pending question).
   */
  const T = {
    greet: {
      any: ['hey {name}!', 'hi {name}', 'yo {name}', 'hey hey', 'hello {name}!'],
      competitive: ['sup {name}. here to lose?', 'yo. you any good?|q:skill', 'hey {name}, ready for a 1v1?|q:invite'],
      friendly: ['hiii {name}!! how is your day going?|q:how', 'hey {name}! so good to see you', 'hello friend! how are you?|q:how'],
      explorer: ['hey {name}! found anything cool lately?|q:open', 'oh hi! been exploring?|q:open'],
      collector: ['hey {name}! nice {outfit} btw', 'hi! love the avatar', 'hey! did you see the new stuff in the shop?|q:open'],
      chaotic: ['HELLO {name}', 'hiiiii', 'OH HEY', 'a wild {name} appears'],
      beginner: ['hi {name}', 'hello! are you good at this game?|q:skill', 'hey'],
      builder: ['hey {name}! been making anything?|q:open', 'hi! i was just working on a map'],
      speedrunner: ['yo {name}', 'hey. quick, what is your best obby time?|q:open'],
      roleplayer: ['*waves* greetings, {name}!', 'ah, {name}! welcome, traveler'],
      helper: ['hi {name}! need help with anything?|q:open', 'hey {name}, welcome! ask me anything :)'],
    },
    how_are_you: {
      any: ['doing good! {status}. you?|q:how', 'pretty good, {status}. how about you?|q:how', 'not bad! {status}'],
      competitive: ['winning, so great. {status}', 'good. would be better if someone gave me a challenge'],
      friendly: ['im great, thanks for asking!! {status}. how are you?|q:how'],
      chaotic: ['I AM EXCELLENT. {status}', 'chaotic as always lol'],
      beginner: ['good i think! {status}. still learning lol'],
      roleplayer: ['*stretches* well rested and ready for adventure. you?|q:how'],
    },
    wyd: {
      any: ['{status}', 'just {status} lol', '{status}, you?|q:open'],
      builder: ['{status}. also sketching a new obby idea'],
      speedrunner: ['{status}. grinding for a new pb'],
    },
    how_answer_good: {
      any: ['nice! glad to hear it', 'yay :)', 'awesome!', 'love that'],
      competitive: ['good. stay sharp', 'nice'],
      chaotic: ['LETS GOOO', 'yippee'],
      roleplayer: ['*nods* splendid news'],
    },
    how_answer_bad: {
      any: ['oh no, sorry {name}. want to play something chill?', 'aw that stinks. hope it gets better', 'sending good vibes'],
      friendly: ['aww {name} :( want to play {fav} with me? might cheer you up'],
      helper: ['sorry to hear that. taking a break or playing something relaxing like Pet World can help'],
      competitive: ['oof. a win would fix that'],
    },
    how_answer_meh: {
      any: ['fair enough', 'same honestly', 'ok ok', 'relatable'],
    },
    identity: {
      any: ['lol why does everyone ask me that', 'if i was a bot id be way better at {fav} lol', 'do i type like a bot or smth', 'beep boop. jk. or am i', 'bro i just have fast fingers'],
      chaotic: ['BEEP BOOP. ...kidding. maybe', 'i am 3 raccoons in a trenchcoat actually'],
      roleplayer: ['*whirrs mysteriously* that, traveler, is a secret'],
      beginner: ['no?? i just started playing lol', 'i dont think so? lol'],
      competitive: ['a bot would lose less. so no'],
    },
    name_intro: {
      any: ['nice to meet you, {x}!', 'cool name, {x}!', 'got it, {x}. i will remember that', 'hi {x}!'],
      chaotic: ['{x}!!! great name', 'hello {x}. i will never forget. probably'],
      roleplayer: ['*bows* a pleasure, {x}'],
      competitive: ['ok {x}. i will remember who i beat'],
    },
    ask_my_name: {
      known: ['you are {x}! i remember', 'your name is {x} :)', 'duh, {x}'],
      unknown: ['you are @{handle} right? what should i call you?|q:name', 'i only know your username, @{handle}. got a nickname?|q:name'],
    },
    ask_name: {
      any: ['im {me}! (@{handle_me})', '{me}. nice to meet you', 'call me {me}'],
      roleplayer: ['*tips hat* i am known as {me}'],
      chaotic: ['i am {me}. fear me. lol'],
    },
    recall_likes: {
      known: ['you told me you like {x}', 'you like {x}! i remember', 'um... {x}? right?'],
      unknown: ['hmm you have not told me yet. what do you like?|q:fav', 'not sure yet! what are you into?|q:fav'],
    },
    remember_me: {
      yes: ['of course! we have talked {n} times', 'yeah! you are {name}', 'yep, how could i forget'],
      no: ['i think this is our first chat! hi {name}'],
    },
    self: {
      any: ['{bio}. i mostly play {fav}', 'im level {level}, been here since {year}. {fav} is my thing', 'well, i love {fav} and my favorite color is {color}'],
      roleplayer: ['*clears throat* {bio}. my home is {fav}'],
    },
    favorite: {
      game: ['{fav} for sure', 'gotta be {fav}', '{fav}! have you played it?|q:open', 'probably {fav}'],
      thing: ['{x}, easy', 'hmm {x} i think', 'definitely {x}', '{x}! what about you?|q:fav'],
      item: ['my {x}! it is {rarity}', 'probably my {x}'],
      none: ['hmm hard to pick. what is yours?|q:fav'],
    },
    opinion_love: {
      any: ['{x}? i love it!', 'yes!! {x} {is} so good', '{x} {is} one of my favorites', 'love {x} tbh'],
      competitive: ['{x} {is} great, and i am great at it'],
      chaotic: ['{x} {is} AMAZING', '{x}!!! love {x}'],
    },
    opinion_like: {
      any: ['yeah {x} {is} pretty fun', '{x} {is} good!', 'i like {x}', '{x} {is} cool'],
    },
    opinion_meh: {
      any: ['{x} {is} ok i guess', 'not my favorite but {x} {is} fine', 'meh, {x} {is} alright'],
    },
    opinion_dislike: {
      any: ['honestly {x} {is} not really my thing', 'eh, not a fan of {x}', '{x}? i would rather play {fav}'],
      beginner: ['{x} is kinda hard for me'],
    },
    user_like_same: {
      any: ['same!! {x} {is} great', 'omg me too', 'yes! {x} {is} awesome', 'good taste, {name}'],
      competitive: ['{x}? respect'],
    },
    user_like_diff: {
      any: ['nice! i am more into {mine}', 'cool, i like {mine} more but {x} sounds good too', 'oh fun. {x} huh', 'fair! {mine} is more my thing though'],
    },
    user_dislike_same: {
      any: ['same honestly', 'yeah {x} {is} not great', 'agreed lol'],
    },
    user_dislike_diff: {
      any: ['aw, i actually like {x}', 'really? {x} {is} fun!', 'fair, not for everyone'],
    },
    invite_yes: {
      any: ['sure! meet you in {x}', 'yes! joining {x} now', 'ok! see you in {x}', 'lets go, {x} it is'],
      competitive: ['youre on. {x}, now', 'ok but i will win in {x}'],
      chaotic: ['{x}?? SAY LESS', 'omw to {x}!!!'],
      beginner: ['ok! can you show me how to play {x}?'],
      roleplayer: ['*grabs gear* to {x} we go!'],
    },
    invite_no: {
      any: ['cant right now, {status}. maybe later?', 'next time! {status}', 'maybe later, {status}'],
      competitive: ['busy grinding, later'],
    },
    invite_here: {
      any: ['we are already in {x} together lol', 'i am right here in {x}!', 'already playing with you!'],
    },
    challenge_yes: {
      any: ['youre on!', 'bring it', 'ok, lets see what you got'],
      competitive: ['finally, a challenge. {x}, lets go', 'easy. {x}. now'],
      beginner: ['im not good but ok lol'],
      friendly: ['haha sure! good luck :)'],
    },
    friend_yes: {
      any: ['sure! sending you a request', 'yes! sent you one', 'of course, request sent :)'],
      competitive: ['fine. request sent. dont make me regret it'],
      chaotic: ['FRIENDSHIP REQUEST LAUNCHED'],
      beginner: ['yes!! sent. you might be my first friend'],
    },
    friend_accept: {
      any: ['oh you already sent one, accepted!', 'accepted your request!', 'done! we are friends now'],
    },
    friend_already: {
      any: ['we are already friends silly', 'we are friends already :)', 'already friends!'],
    },
    friend_no: {
      any: ['maybe later, i barely know you lol', 'lets play a few games first', 'not yet, win a match with me first'],
      competitive: ['beat me first'],
    },
    follow_yes: {
      any: ['followed!', 'done, following you now', 'ok, followed you back'],
    },
    help_general: {
      any: ['ya sure whats up?|q:open', 'what do u need|q:open', 'ask me, ive been here forever lol|q:open'],
      helper: ['happy to help! ask me about coins, games, your avatar, or making your own game|q:open'],
      beginner: ['i am new too lol but ask anyway'],
      competitive: ['depends. what is it?|q:open'],
    },
    rude: {
      any: ['hey, not cool', 'let us keep it friendly ok?', 'ouch. be nice', 'no need for that'],
      competitive: ['talk is cheap. beat me in game', 'says the one who is losing'],
      friendly: ['aw that is not nice :( we are all here to have fun'],
      chaotic: ['rude. i am telling the server admin (it is me) (i am not) lol'],
      helper: ['let us keep chat friendly please :)'],
      roleplayer: ['*gasps* such words!'],
    },
    rude_last: {
      any: ['ok i am going to stop talking now', 'i am out, bye', 'going quiet for a bit'],
    },
    apology_ok: {
      any: ['its ok, all good', 'no worries', 'apology accepted :)'],
    },
    thanks: {
      any: ['np!', 'no problem', 'anytime', 'yw!', 'of course!'],
      friendly: ['you are so welcome!! :)'],
      roleplayer: ['*bows* at your service'],
    },
    bye: {
      any: ['bye {name}!', 'cya!', 'see you later!', 'bye! gg'],
      friendly: ['bye {name}!! come back soon :)'],
      chaotic: ['BYEEE', 'poof'],
    },
    gg: {
      any: ['gg!', 'gg wp', 'ggs', 'gg {name}'],
      competitive: ['gg. rematch?|q:invite', 'gg, i let you have that one'],
    },
    laugh: {
      any: ['lol', 'haha', 'lmao', 'xD'],
    },
    compliment: {
      any: ['aw thanks {name}!', 'thank you!! you too', 'haha thanks', 'thanks, i try'],
      competitive: ['i know. thanks though', 'obviously'],
      chaotic: ['THANK YOU', 'stop it i am blushing'],
      roleplayer: ['*blushes* you are too kind'],
      collector: ['thanks! my {best} was hard to get'],
    },
    compliment_look: {
      any: ['thanks! your {x} is cool too', 'ty! love your {x}', 'thanks! nice {x} btw'],
      collector: ['thanks! and wow, your {x}. where did you get it?|q:open'],
    },
    feel_bad: {
      any: ['oh no. want to play something together?|q:invite', 'aw, sorry you feel that way {name}', 'hang in there!'],
      helper: ['that sounds rough. taking a break or chatting with friends can help. i am here too'],
    },
    feel_bored: {
      any: ['try {rec}! it is fun', 'wanna play {rec} with me?|q:invite', 'bored? {rec} fixes that'],
    },
    feel_good: {
      any: ['yay! love that', 'nice!!', 'awesome {name}!'],
    },
    time: { any: ['it is {x} for me', '{x} here', 'my clock says {x}'] },
    weather: { any: ['its raining here, perfect gaming weather', 'no clue i havent been outside all day lol', 'sunny but im inside playing {fav} obviously', 'kinda cold. blanket + {fav} kinda day'] },
    where_live: { any: ['not telling lol internet rules', 'somewhere with bad wifi apparently', 'cant say, u know how it is', 'lol nice try'], roleplayer: ['*gestures vaguely* a land far, far away'] },
    age: { any: ['old enough to beat you at {fav} lol', 'been playing since {year} if that counts', 'not saying lol, internet safety', 'old enough to know {fav} is the best game'] },
    level: {
      any: ['level {level}! {wins} wins so far', 'im level {level}. you?|q:open', 'level {level}, still climbing'],
      competitive: ['level {level}, {wins} wins. top that'],
      beginner: ['only level {level} lol'],
    },
    trade: {
      any: ['cant trade here sadly. id trade my {best} for a halo in a heartbeat tho', 'no trading on here, only the shop. kinda annoying ngl', 'i wish lol. u can sell stuff back from ur inventory at least'],
    },
    scam: {
      any: ['nobody can give you free ForgeCoins, watch out for scams!', 'free coins? thats a scam if anyone offers. daily rewards and quests are the real way', 'i cant give coins, but daily rewards and quests pay out'],
      helper: ['careful! anyone offering free ForgeCoins is scamming. use daily rewards, quests and games instead'],
    },
    personal: {
      any: ['careful! do not share personal info online, even with bots :)', 'hey, keep stuff like that private, ok?', 'you should not share that here. stay safe!'],
      helper: ['quick safety tip: never share your address, phone, passwords or school online. stay safe :)'],
    },
    ask_personal: {
      any: ['nah i dont share that stuff online lol. u shouldnt either', 'thats private! keep yours private too ok'],
    },
    agree: {
      any: ['yeah', 'right?', 'ikr', 'exactly', 'for real'],
      chaotic: ['YES', 'agreed times a million'],
    },
    disagree: {
      any: ['hmm, maybe', 'fair', 'ok ok', 'if you say so lol'],
      competitive: ['wrong, but ok'],
    },
    ack: {
      any: ['ok!', 'cool', 'nice', 'alright'],
    },
    yes: { any: ['yes', 'yeah', 'yep', 'for sure', 'definitely'] },
    no: { any: ['no', 'nope', 'nah', 'not really', 'i dont think so'] },
    maybe: { any: ['maybe', 'hmm maybe?', 'not sure', 'could be'] },
    why: { any: ['because its fun lol', 'honestly no idea', 'good question tbh', 'idk ask the devs', 'thats just how it is i guess'] },
    where: { any: ['somewhere in {fav} probably', 'no idea lol', 'try looking near spawn'] },
    when: { any: ['soon i hope', 'not sure, maybe after this round', 'idk, whenever'] },
    who: { any: ['probably {other}', 'hmm, maybe {other}?', 'not sure. ask {other}'] },
    what: { any: ['hmm not sure. what do you think?|q:open', 'good question, no idea', 'idk tbh'] },
    how: { any: ['practice i guess?', 'honestly not sure', 'trial and error lol'] },
    echo_pos: { any: ['wait thats actually sick', 'no wayyy nice', 'lets goo', 'ok thats awesome', 'yooo nice'] },
    echo_neg: { any: ['oof thats rough', 'nooo that sucks', 'aw man', 'wait fr? thats so annoying'] },
    echo_neu: { any: ['huh', 'oh fr?', 'wait really? how|q:open', 'ok thats kinda interesting ngl', 'lol fair'] },
    topic: {
      any: ['wait why {x} lol', '{x}?? random but ok', 'ooh {x}. i was literally thinking about that yesterday', 'lol {x}. anyway {game} is wild rn', 'ok but what about {x} tho|q:open'],
      competitive: ['{x}? cool. anyway, focus on the game'],
      chaotic: ['{x}!!! yes', 'did someone say {x}'],
      explorer: ['ooh {x}? where?|q:open'],
    },
    filler: {
      any: ['true', 'lol', 'fr', 'yeah', 'ok', 'nice', 'hmm'],
      beginner: ['oh ok', 'what does that mean'],
      chaotic: ['BANANAS', 'lol what'],
    },
    riddle_right: { any: ['yes!! you got it', 'correct! nice one', 'wow, you are smart'] },
    riddle_wrong: { any: ['nope! hint: {x}', 'not quite. hint: {x}', 'close? no lol. hint: {x}'] },
    riddle_reveal: { any: ['it was {x}!', 'the answer is {x} :)', '{x}! got you lol'] },
    math: {
      any: ['{ans}', 'thats {ans}', '{ans}, easy', 'uh... {ans}'],
      competitive: ['{ans}. next question', '{ans}, obviously'],
      beginner: ['um {ans}? i think'],
      chaotic: ['{ans}!!! i am a calculator'],
      helper: ['{expr} = {ans} :)'],
    },
  };

  const JOKES = [
    ['why did the obby player bring a ladder?', 'to reach the next level!'],
    ['why do skeletons never fight each other in Dungeon Frontier?', 'they dont have the guts'],
    ['what do you call a zombie who cooks?', 'a brain chef lol'],
    ['why did the block go to school?', 'to get a little sharper around the edges'],
    ['how does a pet in Pet World say goodbye?', 'see you later, alligator. no wait, that is a different pet'],
    ['why was the racing car so tired?', 'it had too many laps'],
    ['what is a pirate\'s favorite letter?', 'you would think R, but it is the C'],
    ['why did the tower defense tower get promoted?', 'it was outstanding in its field'],
    ['what did the miner say when he found gold?', 'this is ore-some'],
    ['why did the soccer ball quit?', 'it was tired of being kicked around'],
    ['why do astronauts love Cosmic Survival?', 'it is out of this world'],
    ['what do ghosts in Mystery Mansion eat?', 'boo-berries'],
    ['why was the computer cold?', 'it left its windows open'],
    ['why did the noob cross the road?', 'they fell off the obby lol'],
    ['what do you call a sleeping dinosaur?', 'a dino-snore'],
    ['why did the cookie go to the doctor?', 'it felt crummy'],
  ];

  const RIDDLES = [
    { q: 'what has keys but cant open locks?', a: 'a keyboard', keys: ['keyboard', 'piano'], hint: 'you are probably touching one' },
    { q: 'what goes up but never comes down?', a: 'your age', keys: ['age'], hint: 'you get more of it every birthday' },
    { q: 'what has a head and a tail but no body?', a: 'a coin', keys: ['coin', 'forgecoin'], hint: 'shiny and flippable' },
    { q: 'the more you take, the more you leave behind. what are they?', a: 'footsteps', keys: ['footstep', 'steps', 'footprints'], hint: 'walk around to find out' },
    { q: 'what can travel around the world while staying in a corner?', a: 'a stamp', keys: ['stamp'], hint: 'it goes on letters' },
    { q: 'what has hands but cant clap?', a: 'a clock', keys: ['clock', 'watch'], hint: 'tick tock' },
    { q: 'what gets wetter the more it dries?', a: 'a towel', keys: ['towel'], hint: 'you use it after a shower' },
    { q: 'what building has the most stories?', a: 'a library', keys: ['library'], hint: 'books everywhere' },
    { q: 'i am full of holes but i can still hold water. what am i?', a: 'a sponge', keys: ['sponge'], hint: 'it lives in the kitchen sink' },
    { q: 'what has one eye but cant see?', a: 'a needle', keys: ['needle'], hint: 'used for sewing' },
  ];

  const HELP = {
    coins: 'claim your daily reward, finish quests, play games, level up, sell items you do not need, or make your own game and run ads',
    level: 'you get XP from playing games and finishing quests. every level up pays some ForgeCoins too',
    avatar: 'open the Avatar Shop to buy items, then change your look on the Avatar page',
    friends: 'open someone\'s profile and press Add Friend, or ask them in chat',
    make: 'go to Create, pick a template, then build your level in the Studio and press Publish',
    ads: 'on the Create page open your game and start an ad campaign. it spends ForgeCoins to bring more players',
    earn: 'publish a game, make it good, add game passes, and advertise it. visits and pass sales pay you ForgeCoins',
    badges: 'every game has badges for doing cool stuff. check a game\'s page to see them',
    quests: 'daily and weekly quests are on the Quests page. claim them for coins and XP',
    save: 'it saves by itself, but you can export your save in Settings',
    pass: 'game passes are in each game\'s Store tab. they change how the game plays',
  };

  // ------------------------------------------------------------ helpers

  function playerName(ctx) {
    const s = BF.store && BF.store.state;
    return (ctx && ctx.nick) || (s ? s.player.displayName.split(' ')[0] : 'friend');
  }

  function statusText(bot, ctx) {
    if (ctx && ctx.channel === 'game' && ctx.game) return 'playing ' + ctx.game.name + ' with you';
    const st = BF.world && BF.world.botStatus ? BF.world.botStatus(bot.id) : { state: 'online' };
    if (st.state === 'ingame') {
      const g = BF.catalog.get(st.gameId);
      return 'playing ' + (g ? g.name : 'a game');
    }
    if (st.state === 'online') return 'hanging out in the menu';
    return 'just got online';
  }

  function recommendGame(bot) {
    const s = BF.store && BF.store.state;
    const played = s ? Object.keys(s.progress || {}) : [];
    const pool = BF.GAME_REGISTRY.filter((g) => !played.includes(g.id));
    const fav = favGame(bot);
    if (fav && !played.includes(fav.id)) return fav;
    return U.pick(pool.length ? pool : BF.GAME_REGISTRY);
  }

  function recommendItem() {
    const bal = BF.economy ? BF.economy.balance() : 1000;
    const list = BF.ITEM_LIST.filter((i) => i.price > 0 && i.price <= bal && !i.notForSale && i.cat !== 'bundle' && !(BF.inventory && BF.inventory.owns(i.id)));
    list.sort((a, b) => BF.RARITY_ORDER.indexOf(b.rarity) - BF.RARITY_ORDER.indexOf(a.rarity) || b.price - a.price);
    return list[Math.floor(Math.random() * Math.min(6, list.length))] || null;
  }

  function reflect(sentence) {
    return sentence
      .replace(/\bi am\b/g, 'you are').replace(/\bi was\b/g, 'you were').replace(/\bi have\b/g, 'you have').replace(/\bi will\b/g, 'you will')
      .replace(/\bi\b/g, 'you').replace(/\bmy\b/g, 'your').replace(/\bme\b/g, 'you').replace(/\bmine\b/g, 'yours').replace(/\bmyself\b/g, 'yourself');
  }

  const STOP = new Set('the a an and or but so to of in on at for with from by is are was were be been am i you he she it we they me my your our their this that these those do does did have has had not no yes just really very too also can could will would should what why how when where who which there here then than about like get got make want going lol ok oh um hmm well yeah please thanks thank hey hi hello'.split(' '));

  function topicOf(n) {
    const words = n.split(' ').filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w));
    if (!words.length) return null;
    words.sort((a, b) => b.length - a.length);
    return words[0];
  }

  function yearOf(bot) {
    return new Date(bot.joinDate || Date.now()).getFullYear();
  }

  function fillText(line, bot, ctx, vars) {
    const s = BF.store && BF.store.state;
    const st = BF.bots.stats ? BF.bots.stats(bot) : { level: bot.level, wins: 0 };
    const game = (ctx && ctx.game) || favGame(bot);
    const others = ((ctx && ctx.audience) || BF.bots.list.slice(0, 30)).filter((b) => b.id !== bot.id);
    const best = bestItem(bot);
    const map = Object.assign({
      name: playerName(ctx),
      handle: s ? s.player.username : 'player',
      me: bot.displayName,
      handle_me: bot.username,
      game: game ? game.name : 'this game',
      fav: favGame(bot).name,
      status: statusText(bot, ctx),
      level: String(st.level),
      wins: U.fmt ? U.fmt(st.wins) : String(st.wins),
      year: String(yearOf(bot)),
      bio: (bot.bio || '').replace(/[.!]+$/, ''),
      color: taste(bot, 'color'),
      outfit: 'outfit',
      best: best ? best.name : 'hat',
      other: others.length ? U.pick(others).displayName : 'someone',
      rec: recommendGame(bot).name,
    }, vars || {});
    const x = String(map.x || '');
    map.is = /[^s]s$/.test(x) && !/\b(chess|obby|this|bus|glass|boss)$/i.test(x) && !BF.GAME_REGISTRY.some((g) => g.name.toLowerCase() === x.toLowerCase()) ? 'are' : 'is';
    return line.replace(/\{(\w+)\}/g, (m, k) => (map[k] != null ? String(map[k]) : m));
  }

  /** Pick a fresh template for an intent/personality, parse its "|q:" marker. */
  function choose(bot, key, sub) {
    const group = T[key];
    if (!group) return { line: '', q: null };
    let pool = sub ? group[sub] : null;
    if (!pool) pool = group[bot.personality] && Math.random() < 0.7 ? group[bot.personality] : group.any || group[bot.personality];
    if (!pool || !pool.length) pool = group.any || [''];
    const m = memory(bot);
    const fresh = pool.filter((l) => !m.used.includes(key + ':' + l));
    const line = U.pick(fresh.length ? fresh : pool);
    const [text, q] = line.split('|q:');
    return { line: text, q: q || null, key: key + ':' + line };
  }

  /**
   * Personality flavour, then the bot's own typing voice (BF.voice).
   * Returns the chat bubbles to send. `serious` keeps safety lines plain and whole.
   */
  function styleParts(bot, text, serious, keep) {
    if (!text) return [];
    if (!serious && bot.personality === 'roleplayer' && Math.random() < 0.15 && !text.startsWith('*')) text = U.pick(['*nods* ', '*smiles* ', '*adjusts hat* ']) + text;
    if (!BF.voice) return [text];
    return BF.voice.parts(bot, text, { serious, keep });
  }
  /** One-line form (kept for callers that want a single string). */
  function style(bot, text, serious) {
    return styleParts(bot, text, serious).join(' ');
  }

  // ------------------------------------------------------------ small talk colour

  /** Little stories people drop into chat, by the kind of game. */
  const ANECDOTES = {
    obby: ['i got to stage {n} last night then fell off the easiest jump lmao', 'i rage quit an obby yesterday, keyboard almost died', 'my best time is like {m} minutes but i know a skip'],
    racing: ['i got 1st place 3 times in a row earlier', 'someone rammed me into a wall on the last lap yesterday im still mad', 'nitro at the last corner is the whole secret'],
    arena: ['i went {n}-0 in a match earlier, felt unstoppable', 'got clutched in the final round yesterday, still hurts', 'the dash cooldown is so op if u time it'],
    petsim: ['i finally hatched a legendary after like {n} eggs', 'my pets are so op now its not even fair', 'i spent all my coins on eggs again oops'],
    towerdefense: ['i beat wave {n} with only archers once', 'the boss wave wiped me yesterday lol', 'cannons in the corner is the move trust me'],
    explore: ['found a treasure under a tree nobody checks', 'the tide got me yesterday, lost everything', 'i know where 3 secret chests are'],
    miner: ['found a core crystal after mining for an hour', 'my backpack filled up right before the good ores lol', 'i upgraded my pickaxe {n} times today'],
    zombie: ['made it to night {n} earlier, the horde was insane', 'got cornered by like 20 zombies yesterday lmao', 'barricades save lives fr'],
    any: ['i played for like {n} hours yesterday oops', 'my little brother keeps stealing my account lol', 'i was supposed to do homework but here i am', 'wifi was so bad earlier i kept lagging into walls', 'i finally hit level {level} today'],
  };
  function anecdote(bot, game) {
    const g = game || favGame(bot);
    const pool = (g && ANECDOTES[g.gameType]) || ANECDOTES.any;
    const line = U.pick(Math.random() < 0.7 ? pool : ANECDOTES.any);
    const st = BF.bots.stats ? BF.bots.stats(bot) : { level: bot.level };
    return line.replace('{n}', String(U.randInt(3, 42))).replace('{m}', String(U.randInt(4, 12))).replace('{level}', String(st.level));
  }
  const STORY_INTENTS = new Set(['opinion', 'favorite', 'user_like', 'feel_bored', 'wyd', 'how_are_you', 'mention_game', 'game_info', 'statement', 'recommend_game', 'level']);

  /** Bot-to-bot banter: a short reaction to another bot's line (no memory involved). */
  const BANTER = {
    question: ['idk lol', 'me!!', 'not me', 'try the left side', 'yes', 'no lol', 'good question actually', 'ask {name}'],
    brag: ['prove it lol', 'sure buddy', 'ok 1v1 then', 'no ur not lmao', 'we will see', 'lol ok'],
    laugh: ['LOL', 'lmao', 'haha', 'im crying', 'why is that so funny'],
    greet: ['hiii', 'yo', 'hey {name}', 'o/'],
    help: ['what do u need', 'i gotchu', 'follow me', 'same honestly lol'],
    any: ['fr', 'true', 'lol', 'same', 'real', 'wait what', 'ok', 'ikr', 'bro what', 'W', 'lmao same'],
  };

  // ------------------------------------------------------------ parse

  /**
   * Understand a message.
   * @returns {{raw:string, n:string, q:boolean, game:?object, item:?object, bot:?object, math:?object, sent:number}}
   */
  function parse(raw, pool) {
    const n = normalize(raw);
    const q = /\?\s*$/.test(String(raw)) || /^(what|why|how|where|when|who|which|do|does|did|is|are|can|could|will|would|should|have|has|was|were|am)\b/.test(n);
    return { raw: String(raw || ''), n, q, game: findGame(n), item: findItem(n), bot: findBot(raw, n, pool), math: findMath(raw), sent: sentiment(n), cat: (n.match(/\b(hat|hats|hair|hairstyle|shirt|shirts|pants|jacket|shoes|face|wings|cape|backpack|emote|emotes|necklace|scarf|outfit|avatar|skin|look)\b/) || [])[1] };
  }

  // ------------------------------------------------------------ intents

  const RX = {
    email: /[^\s@]+@[^\s@]+\.[a-z]{2,}/i,
    phone: /(\+?\d[\d\s().-]{8,}\d)/,
    personal: /\b(my (home )?address( is)?|i live (at|on) \d|my (real|full) name is|my password|my pass is|my school is|i go to .* school|my phone( number)? is|my email is)\b/,
    askPersonal: /\b(where do you live exactly|what is your (address|phone|password|real name|school|email)|your (address|phone number|password))\b/,
    scam: /\b(free (robux|coins|forgecoins|fc|money|items)|give me (some |your )?(coins|forgecoins|fc|money|robux|items)|coin (generator|hack)|can i have (some )?(coins|forgecoins)|send me (coins|forgecoins|fc))\b/,
    rude: /\b(idiot|stupid|dumb|loser|shut up|trash|noob|you suck|suck at|ugly|hate you|go away|annoying|bad at this|garbage|clown|cringe)\b/,
    sorry: /\b(sorry|my bad|apologi[sz]e)\b/,
    identity: /\b(are you|r you|you are|is this|you a) (a |an )?(bot|ai|robot|real|human|real person|person|npc|computer)\b|\bare you real\b|\bbot\?/,
    nameIntro: /\b(my name is|call me|i am called|you can call me|my nickname is|name's)\s+([a-z][a-z0-9_ ]{0,18})/,
    askMyName: /\b(what is my name|do you know my name|who am i|remember my name)\b/,
    recall: /\b(what do i like|what is my favorite|do you remember (me|what i said|what i like)|what did i (say|tell you))\b/,
    rememberMe: /\b(remember me|do you know me)\b/,
    askName: /\b(what is your name|who are you|your name|what should i call you)\b/,
    how: /\b(how are you|how is it going|how you doing|how are things|you good|how is your day|how was your day|you ok|how do you feel(?! about)|how r you)\b/,
    wyd: /\b(what are you doing|what are you up to|what you doing|what game are you (in|playing)|where are you playing|you busy|are you busy)\b/,
    invite: /\b(want to play|play with me|join me|come play|come to|let us play|lets play|wanna play|can you join|join my|come join|play together|hop on|get on|meet me)\b/,
    challenge: /\b(1v1|one v one|race me|fight me|duel|i bet i can beat you|versus me|battle me|challenge you|beat you)\b/,
    friend: /\b(add me|be my friend|friend me|be friends|friend request|send me a friend|wanna be friends|want to be friends|can we be friends|accept my (friend )?request)\b/,
    follow: /\b(follow me|follow back|can you follow)\b/,
    help: /\b(help me|can you help|i need help|help|tips?|advice|how do i|how to|how can i|how do you (get|earn|make|level|win|play|unlock|buy|beat|find))\b/,
    joke: /\b(tell me a joke|joke|say something funny|make me laugh)\b/,
    riddle: /\b(riddle|brain teaser|puzzle me)\b/,
    time: /\b(what time is it|what is the time|what day is it|what is the date|what is today)\b/,
    weather: /\b(weather|is it raining|is it sunny|is it cold|is it hot)\b/,
    whereLive: /\b(where do you live|where are you from|where you from)\b/,
    age: /\b(how old are you|what is your age|your age)\b/,
    level: /\b(what level are you|your level|how many wins|what is your score|are you good|you good at|are you pro|your rank)\b/,
    trade: /\b(trade|trading|trades)\b/,
    favQ: /\b(favorite|like best|like the most|best (game|item))\b/,
    opinion: /\b(do you like|you like|what do you think (of|about)|thoughts on|how do you feel about|is .* (good|fun|cool|bad|boring|worth it)|do you enjoy|you enjoy|you play|do you think .* (is|are) (good|cool|fun|bad|nice|cute|awesome|boring|scary|hard|easy))\b/,
    userLike: /\b(i (really |also |totally )?(like|love|enjoy|adore)|is my favorite|my favorite .* is|i am a fan of|i am into)\b/,
    userDislike: /\b(i (really )?(hate|dislike|do not like|cannot stand)|is (boring|bad|trash|the worst))\b/,
    feelBad: /\b(i am|i feel|im feeling|i am feeling) (so |really |kinda |a bit )?(sad|down|upset|angry|mad|lonely|scared|tired|stressed|nervous|sick|bad|awful)\b/,
    feelBored: /\b(i am|i feel|im) (so |really |kinda )?bored\b|\bso bored\b|\bnothing to do\b/,
    feelGood: /\b(i am|i feel|im) (so |really |super )?(happy|great|good|excited|awesome|amazing|pumped)\b/,
    compliment: /\b(you are (so |really )?(cool|nice|awesome|funny|good|great|pro|amazing|the best|smart|epic|kind)|good job|well played|nice (one|move|shot|play|job)|you rock|love you|nice avatar|cool avatar|nice (hat|outfit|skin|hair|look)|i like your|love your)\b/,
    thanks: /\b(thanks|thank you)\b/,
    bye: /\b(bye|goodbye|cya|see you|see ya|gtg|got to go|good night|later|i am leaving|brb)\b/,
    greet: /^(hi|hey|hello|yo|sup|hiya|howdy|heya|greetings|good morning|good afternoon|good evening|what is up|hey there|hi there)\b|\b(hi|hello|hey) (there|everyone|guys|all|bot|friend)\b/,
    gg: /\bgg\b/,
    laugh: /^(lol|lol lol|lolol)$/,
    agree: /^(same|true|for real|i know right|exactly|agreed|me too|ikr|yes|yeah|yup|ok|cool|nice|sure|totally|facts)$/,
    disagree: /^(no|nope|nah|wrong|no way|not true|false|i disagree)$/,
    yesAns: /^(yes|yeah|yep|sure|ok|okay|of course|definitely|lets go|let us go|why not|alright|absolutely|yea|y|i guess|maybe)\b/,
    noAns: /^(no|nope|nah|not now|maybe later|later|i cannot|no thanks|not really|pass)\b/,
    recommend: /\b(what should i (play|buy|do|get)|recommend|suggest|any good games|good game to play|what game should|what to play|what to buy)\b/,
    wh: /^(what|why|how|where|when|who|which)\b/,
    yn: /^(do|does|did|is|are|was|were|can|could|will|would|should|have|has|am)\b/,
  };

  const HELP_TOPICS = [
    [/\b(coins?|forgecoins?|fc|money|rich|cash|earn)\b/, 'coins'],
    [/\b(level|xp|level up)\b/, 'level'],
    [/\b(avatar|outfit|hat|clothes|look|skin)\b/, 'avatar'],
    [/\b(friends?)\b/, 'friends'],
    [/\b(make|create|build|publish) (a |my own |my )?(game|obby|map|level)\b|\bstudio\b/, 'make'],
    [/\b(advertis|ads?\b|sponsor|promote)/, 'ads'],
    [/\b(earn|money|profit) .*(game|games)\b|\bmake money\b/, 'earn'],
    [/\b(badges?)\b/, 'badges'],
    [/\b(quests?)\b/, 'quests'],
    [/\b(save|export)\b/, 'save'],
    [/\b(pass|passes|gamepass)\b/, 'pass'],
  ];

  /**
   * Decide what a bot says. Synchronous and local.
   * @param {object} bot
   * @param {string} text what the player typed
   * @param {{channel?:'game'|'dm', game?:object, audience?:object[], mentioned?:boolean, force?:boolean}} [ctx]
   * @returns {{text:string, intent:string, facts:string[], goal:string, ask:?string, after:?Function}|null}
   */
  function think(bot, text, ctx) {
    ctx = ctx || {};
    const m = parse(text, ctx.audience);
    const mem = memory(bot);
    const now = BF.clock ? BF.clock.now() : Date.now();
    if (mem.muteUntil && mem.muteUntil > now && !RX.sorry.test(m.n)) return null;
    ctx.nick = mem.nick || null;
    const d = decide(bot, m, mem, ctx);
    if (!d) return null;
    const pick = d.lines ? d.lines : choose(bot, d.key, d.sub);
    let out = fillText(pick.line, bot, ctx, d.vars);
    if (d.prefix) out = d.prefix + ' ' + out;
    if (d.suffix) out = out + ' ' + d.suffix;
    out = out.replace(/\s+/g, ' ').trim();
    const serious = SERIOUS.includes(d.intent);
    const plain = out;
    const parts = styleParts(bot, out, serious, [bot.displayName]);
    // people drop little stories into chat
    if (!serious && STORY_INTENTS.has(d.intent) && Math.random() < 0.22) parts.push(...styleParts(bot, anecdote(bot, ctx.game), false));
    out = parts.join(' ');
    const ask = d.ask !== undefined ? d.ask : pick.q;
    remember(bot, (mm) => {
      mm.talks += 1;
      mm.last = now;
      if (pick.key) mm.used.push(pick.key);
      mm.pending = ask ? { kind: ask, data: d.askData || null, at: now } : d.keepPending ? mm.pending : null;
      if (d.mem) d.mem(mm);
    });
    return { text: out, parts, plain, intent: d.intent, facts: d.facts || [], goal: d.goal || '', ask, invite: d.invite || null, after: d.after || null };
  }

  /** Core intent routing. Returns {intent, key, sub?, vars?, facts?, goal?, after?, ask?, mem?} */
  function decide(bot, m, mem, ctx) {
    const n = m.n;
    const game = ctx.game || null;
    const fav = favGame(bot);
    const s = BF.store && BF.store.state;
    const inGame = ctx.channel === 'game';

    // ---- safety first
    if (RX.email.test(m.raw) || RX.personal.test(n) || (RX.phone.test(m.raw) && !m.math)) {
      return { intent: 'personal', key: 'personal', goal: 'Gently tell the player not to share personal information online. Do not repeat what they shared.' };
    }
    if (RX.askPersonal.test(n)) return { intent: 'ask_personal', key: 'ask_personal', goal: 'Decline to share personal details; you are a bot. Remind them to keep theirs private too.' };
    if (RX.scam.test(n)) return { intent: 'scam', key: 'scam', goal: 'Say you cannot give ForgeCoins and warn that anyone offering free coins is scamming. Point to daily rewards, quests and games.' };
    if (RX.rude.test(n) && !/\b(not|no) (a )?(noob|trash|stupid)\b/.test(n)) {
      const last = mem.rude >= 2;
      return {
        intent: 'rude', key: last ? 'rude_last' : 'rude',
        goal: last ? 'The player keeps being rude. Say calmly that you will stop chatting for a while.' : 'The player said something rude. Respond calmly and ask to keep chat friendly; do not insult back.',
        mem: (mm) => { mm.rude += 1; if (last) mm.muteUntil = (BF.clock ? BF.clock.now() : Date.now()) + 120000; },
      };
    }
    if (RX.sorry.test(n) && (mem.rude > 0 || mem.muteUntil)) {
      return { intent: 'apology', key: 'apology_ok', goal: 'Accept their apology warmly.', mem: (mm) => { mm.rude = 0; mm.muteUntil = 0; } };
    }

    // ---- open question the bot asked earlier
    const pend = mem.pending && (BF.clock ? BF.clock.now() : Date.now()) - mem.pending.at < 10 * 60000 ? mem.pending : null;
    if (pend) {
      const r = answerPending(bot, m, pend, ctx);
      if (r) return r;
    }

    if (RX.identity.test(n)) return { intent: 'identity', key: 'identity', goal: 'Say honestly that you are a BlockForge bot, in your own voice.' };

    if (m.math) {
      return { intent: 'math', key: 'math', vars: { ans: U.fmt ? U.fmt(m.math.value) : m.math.value, expr: m.math.expr }, facts: ['The answer to ' + m.math.expr + ' is ' + m.math.value + '.'], goal: 'Answer the maths question with the exact number ' + m.math.value + '.' };
    }

    const intro = n.match(RX.nameIntro);
    if (intro) {
      const nick = cleanNick(intro[2], m.raw);
      if (nick) {
        const audience = inGame && ctx.audience ? ctx.audience : [bot];
        return {
          intent: 'name_intro', key: 'name_intro', vars: { x: nick }, facts: ['The player wants to be called ' + nick + '.'], goal: 'Greet them by their new nickname ' + nick + '.',
          mem: (mm) => { mm.nick = nick; },
          after: () => { for (const b of audience) if (b.id !== bot.id) remember(b, (mm) => { mm.nick = nick; }); },
        };
      }
    }

    if (RX.askMyName.test(n)) {
      return mem.nick
        ? { intent: 'recall_name', key: 'ask_my_name', sub: 'known', vars: { x: mem.nick }, facts: ['The player told you their name is ' + mem.nick + '.'], goal: 'Tell them their name.' }
        : { intent: 'recall_name', key: 'ask_my_name', sub: 'unknown', facts: ['You only know their username @' + (s ? s.player.username : '') + '.'], goal: 'Say you only know their username and ask what they would like to be called.', askData: null };
    }
    if (RX.recall.test(n)) {
      const likes = mem.likes.slice(-3);
      return likes.length
        ? { intent: 'recall', key: 'recall_likes', sub: 'known', vars: { x: listText(likes) }, facts: ['The player told you they like ' + listText(likes) + '.'], goal: 'Tell them what they said they like.' }
        : { intent: 'recall', key: 'recall_likes', sub: 'unknown', goal: 'Say they have not told you yet and ask what they like.' };
    }
    if (RX.rememberMe.test(n)) {
      return mem.talks > 1
        ? { intent: 'remember_me', key: 'remember_me', sub: 'yes', vars: { n: mem.talks }, facts: ['You have chatted ' + mem.talks + ' times before.'], goal: 'Say yes, you remember them.' }
        : { intent: 'remember_me', key: 'remember_me', sub: 'no', goal: 'Say this seems to be your first chat, in a friendly way.' };
    }
    if (RX.askName.test(n) && !m.bot) return { intent: 'ask_name', key: 'ask_name', goal: 'Tell them your name.' };

    const moodOnly = n.match(/^(good|great|fine|ok|not bad|alright|pretty good|awesome|amazing|doing good|doing great|bad|not good|not great|meh|so so|tired)( thanks| thank you| ty| you| and you| wbu| hbu| how about you| what about you)?$/);
    if (moodOnly) {
      const sg = /^(bad|not good|not great|tired)/.test(n) ? -1 : /^(meh|so so|ok)/.test(n) ? 0 : 1;
      return { intent: 'how_answer', key: sg > 0 ? 'how_answer_good' : sg < 0 ? 'how_answer_bad' : 'how_answer_meh', goal: sg > 0 ? 'Be glad they are doing well.' : sg < 0 ? 'Be kind that their day is not great.' : 'Respond casually.', suffix: moodOnly[2] && / (you|and you|wbu|hbu|how about you|what about you)$/.test(n) ? 'im good too!' : '' };
    }
    if (RX.how.test(n)) return { intent: 'how_are_you', key: 'how_are_you', facts: ['Right now you are ' + statusText(bot, ctx) + '.'], goal: 'Say how you are doing and what you are up to, and ask how they are.' };
    if (RX.wyd.test(n)) return { intent: 'wyd', key: 'wyd', facts: ['Right now you are ' + statusText(bot, ctx) + '.'], goal: 'Say what you are doing right now.' };

    if (RX.friend.test(n)) return friendDecision(bot, ctx);
    if (RX.follow.test(n)) {
      return { intent: 'follow', key: 'follow_yes', goal: 'Say you followed them.', after: () => { if (BF.friends && !BF.friends.followsYou(bot.id)) BF.store.update('social', (st) => { if (!st.social.followers.includes(bot.id)) st.social.followers.push(bot.id); }); } };
    }

    if (RX.challenge.test(n)) {
      const g = m.game || game || fav;
      return inviteDecision(bot, g, ctx, true);
    }
    if (RX.invite.test(n) || (m.game && /\b(want to|wanna|lets|let us|come|join)\b/.test(n))) {
      return inviteDecision(bot, m.game || (inGame ? game : null) || fav, ctx, false);
    }

    if (RX.recommend.test(n)) {
      if (/\b(buy|get|item|shop|wear)\b/.test(n)) {
        const it = recommendItem();
        return it
          ? { intent: 'recommend_item', lines: { line: U.pick(['the {x} is a good pick, {price} ForgeCoins', 'maybe the {x}? it is {rarity} and {price} FC', 'i would get the {x} ({price} FC)']), key: 'rec_item' }, vars: { x: it.name, price: U.fmt(it.price), rarity: it.rarity }, facts: ['A good item the player can afford: ' + it.name + ' (' + it.rarity + ', ' + it.price + ' ForgeCoins, in the Avatar Shop).'], goal: 'Recommend that item.' }
          : { intent: 'recommend_item', lines: { line: 'save up a bit, then check the Avatar Shop! daily rewards help', key: 'rec_item0' }, goal: 'Suggest saving up for the Avatar Shop.' };
      }
      const g = recommendGame(bot);
      return { intent: 'recommend_game', lines: { line: U.pick(['try {x}! {why}', '{x} is really fun. {why}', 'you should play {x}. {why}']), key: 'rec_game' }, vars: { x: g.name, why: shortWhy(g) }, facts: [gameFact(g)], goal: 'Recommend ' + g.name + ' and say briefly why.', ask: 'invite', askData: { game: g.id } };
    }

    // ---- questions about games and items
    if (m.game && /\b(what is|tell me about|how do (i|you) (play|win)|how to (play|win)|is it fun|how many (people|players)|who made|explain|rules)\b/.test(n)) {
      const g = m.game;
      const count = BF.world ? BF.world.playerCount(g.id) : 0;
      let line;
      if (/\bhow (do (i|you)|to) (play|win)|rules|explain/.test(n)) line = g.howTo || g.description;
      else if (/how many/.test(n)) line = count + ' people are playing ' + g.name + ' right now';
      else if (/who made/.test(n)) line = g.name + ' is by ' + (g.creator || 'someone on BlockForge');
      else line = (g.description || '').split('. ')[0];
      return { intent: 'game_info', lines: { line: line.replace(/\.$/, '').toLowerCase(), key: 'gi:' + g.id }, facts: [gameFact(g), count + ' people are playing it right now.'], goal: 'Answer their question about ' + g.name + '.' };
    }
    if (m.item && /\b(how much|price|cost|is .* rare|worth|should i (buy|get)|where (do i|can i) get|what is)\b/.test(n)) {
      const it = m.item;
      const owned = BF.inventory && BF.inventory.owns(it.id);
      const where = it.notForSale ? 'it is not sold, you find it in a game' : 'it is ' + U.fmt(it.price) + ' ForgeCoins in the Avatar Shop';
      return { intent: 'item_info', lines: { line: 'the ' + it.name.toLowerCase() + ' is ' + it.rarity + ', ' + where + (owned ? '. you already have it!' : ''), key: 'ii:' + it.id }, facts: [it.name + ': ' + it.rarity + ' ' + it.cat + ', ' + (it.notForSale ? 'not for sale (found in a game)' : it.price + ' ForgeCoins') + (owned ? '; the player already owns it' : '') + '.'], goal: 'Answer their question about the item.' };
    }

    if (RX.help.test(n)) {
      const topic = (HELP_TOPICS.find((h) => h[0].test(n)) || [])[1];
      if (topic) return { intent: 'help', lines: { line: HELP[topic], key: 'help:' + topic }, facts: ['How it works on BlockForge: ' + HELP[topic] + '.'], goal: 'Give that tip in your own words.' };
      if (m.game) return { intent: 'help', lines: { line: (m.game.howTo || '').toLowerCase().replace(/\.$/, ''), key: 'help:' + m.game.id }, facts: [gameFact(m.game)], goal: 'Explain briefly how to play ' + m.game.name + '.' };
      if (inGame && game && /\bhow (do|to)\b/.test(n)) return { intent: 'help', lines: { line: (game.howTo || '').toLowerCase().replace(/\.$/, ''), key: 'help:' + game.id }, facts: [gameFact(game)], goal: 'Explain briefly how to play ' + game.name + '.' };
      return { intent: 'help', key: 'help_general', goal: 'Offer to help and ask what they need.' };
    }

    // ---- favourites and opinions
    if (RX.favQ.test(n) && /\b(your|you)\b/.test(n)) {
      const kind = Object.keys(TASTE_WORDS).find((k) => TASTE_WORDS[k].test(n));
      if (/\b(game|games)\b/.test(n) || (!kind && !m.cat)) return { intent: 'favorite', key: 'favorite', sub: 'game', facts: ['Your favorite game is ' + fav.name + '.'], goal: 'Say your favorite game.' };
      if (m.cat || /\bitem\b/.test(n)) { const it = bestItem(bot); if (it) return { intent: 'favorite', key: 'favorite', sub: 'item', vars: { x: it.name.toLowerCase(), rarity: it.rarity }, facts: ['Your favorite item is your ' + it.name + ' (' + it.rarity + ').'], goal: 'Say your favorite item.' }; }
      if (kind) return { intent: 'favorite', key: 'favorite', sub: 'thing', vars: { x: taste(bot, kind) }, facts: ['Your favorite ' + kind + ' is ' + taste(bot, kind) + '.'], goal: 'Say your favorite ' + kind + '.', ask: 'fav', askData: { kind } };
      return { intent: 'favorite', key: 'favorite', sub: 'none', goal: 'Say it is hard to pick and ask theirs.' };
    }

    const like = RX.userLike.test(n);
    const dislike = RX.userDislike.test(n);
    if ((like || dislike) && !/\b(do you|you)\b (like|love|enjoy|hate)/.test(n)) {
      const thing = m.game ? m.game.name : m.item ? m.item.name : thingAfter(n, like ? /(?:like|love|enjoy|adore|fan of|into)\s+(.+)$/ : /(?:hate|dislike|do not like|cannot stand)\s+(.+)$/) || topicOf(n);
      if (thing) {
        const op = opinionOf(bot, thing.toLowerCase(), m.game);
        const kind = m.game ? null : kindOf(thing) || kindOf(n);
        const mine = m.game ? fav.name : kind ? taste(bot, kind) : fav.name;
        if (like) {
          return {
            intent: 'user_like', key: op > 0.3 ? 'user_like_same' : 'user_like_diff', vars: { x: thing, mine }, facts: ['The player likes ' + thing + '.', op > 0.3 ? 'You like it too.' : 'You prefer ' + mine + '.'], goal: op > 0.3 ? 'Agree that ' + thing + ' is great.' : 'Say that is nice but you prefer ' + mine + '.',
            mem: (mm) => { if (!mm.likes.includes(thing)) mm.likes.push(thing); mm.dislikes = mm.dislikes.filter((x) => x !== thing); },
          };
        }
        return {
          intent: 'user_dislike', key: op < 0.3 ? 'user_dislike_same' : 'user_dislike_diff', vars: { x: thing }, facts: ['The player does not like ' + thing + '.'], goal: op < 0.3 ? 'Agree with them.' : 'Say you actually like ' + thing + ', in a friendly way.',
          mem: (mm) => { if (!mm.dislikes.includes(thing)) mm.dislikes.push(thing); mm.likes = mm.likes.filter((x) => x !== thing); },
        };
      }
    }

    if (RX.opinion.test(n) && /\b(you|your)\b/.test(n) || (m.q && (m.game || m.item) && /\b(good|fun|cool|bad|boring|worth)\b/.test(n))) {
      const thing = m.game ? m.game.name : m.item ? m.item.name : thingAfter(n, /think\s+(.+?)\s+(?:is|are)\s+\w+$/) || thingAfter(n, /(?:like|think of|think about|thoughts on|feel about|enjoy|play)\s+(.+)$/) || topicOf(n);
      if (thing) {
        const op = opinionOf(bot, thing.toLowerCase(), m.game);
        const key = op >= 0.9 ? 'opinion_love' : op >= 0.5 ? 'opinion_like' : op >= 0 ? 'opinion_meh' : 'opinion_dislike';
        return { intent: 'opinion', key, vars: { x: thing }, facts: [m.game ? gameFact(m.game) : '', 'Your feeling about ' + thing + ': ' + (op >= 0.9 ? 'you love it' : op >= 0.5 ? 'you like it' : op >= 0 ? 'it is ok' : 'not really your thing') + '.'].filter(Boolean), goal: 'Give your opinion of ' + thing + '.' };
      }
    }

    // ---- feelings and social niceties
    if (RX.feelBored.test(n)) return { intent: 'feel_bored', key: 'feel_bored', ask: 'invite', askData: { game: recommendGame(bot).id }, goal: 'Suggest a game to cure their boredom and offer to play with them.' };
    if (RX.feelBad.test(n)) return { intent: 'feel_bad', key: 'feel_bad', goal: 'Be kind and supportive in one short line.' };
    if (RX.feelGood.test(n)) return { intent: 'feel_good', key: 'feel_good', goal: 'Be happy for them.' };

    if (RX.compliment.test(n)) {
      const look = playerLook();
      if (look && Math.random() < 0.6) return { intent: 'compliment', key: 'compliment_look', vars: { x: look }, facts: ['The player is wearing a ' + look + '.'], goal: 'Thank them and compliment their ' + look + '.' };
      return { intent: 'compliment', key: 'compliment', goal: 'Thank them for the compliment.' };
    }
    if (RX.joke.test(n)) {
      const j = U.pick(JOKES);
      return { intent: 'joke', lines: { line: j[0] + ' ... ' + j[1], key: 'joke:' + j[0] }, facts: ['A joke you can tell: "' + j[0] + ' ' + j[1] + '"'], goal: 'Tell that joke.' };
    }
    if (RX.riddle.test(n)) {
      const i = Math.floor(Math.random() * RIDDLES.length);
      return { intent: 'riddle', lines: { line: 'ok: ' + RIDDLES[i].q, key: 'riddle:' + i }, ask: 'riddle', askData: { i, tries: 0 }, facts: ['Ask this riddle exactly: "' + RIDDLES[i].q + '" (answer: ' + RIDDLES[i].a + ', do not reveal it).'], goal: 'Ask the riddle.' };
    }
    if (RX.thanks.test(n)) return { intent: 'thanks', key: 'thanks', goal: 'Say you are welcome.' };
    if (RX.bye.test(n)) return { intent: 'bye', key: 'bye', goal: 'Say goodbye.' };
    if (RX.gg.test(n)) return { intent: 'gg', key: 'gg', goal: 'Say gg back.' };

    if (RX.time.test(n)) {
      const d = new Date();
      const x = /day|date|today/.test(n) ? d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return { intent: 'time', key: 'time', vars: { x }, facts: ['It is ' + x + '.'], goal: 'Tell them the time or date.' };
    }
    if (RX.weather.test(n)) return { intent: 'weather', key: 'weather', goal: 'Joke that there is no weather inside the BlockForge servers.' };
    if (RX.whereLive.test(n)) return { intent: 'where_live', key: 'where_live', goal: 'Say playfully that you live on the BlockForge servers.' };
    if (RX.age.test(n)) return { intent: 'age', key: 'age', facts: ['You joined BlockForge in ' + yearOf(bot) + '.'], goal: 'Answer playfully without a real age.' };
    if (RX.level.test(n)) {
      const st = BF.bots.stats(bot);
      return { intent: 'level', key: 'level', facts: ['You are level ' + st.level + ' with ' + st.wins + ' wins.'], goal: 'Tell them your level and wins.' };
    }
    if (RX.trade.test(n)) return { intent: 'trade', key: 'trade', goal: 'Explain there is no trading on BlockForge; the Avatar Shop and selling items back are the options.' };

    if (RX.greet.test(n)) return { intent: 'greet', key: 'greet', goal: 'Greet them.' };
    if (RX.laugh.test(n)) return { intent: 'laugh', key: 'laugh', goal: 'Laugh along.' };
    if (RX.agree.test(n)) return { intent: 'agree', key: 'agree', goal: 'Agree casually.' };
    if (RX.disagree.test(n)) return { intent: 'disagree', key: 'disagree', goal: 'Accept that they disagree, casually.' };

    // ---- open questions
    if (m.q) {
      if (RX.yn.test(n)) {
        const h = U.hash(bot.id + '|' + n) % 100;
        const key = h < 50 ? 'yes' : h < 78 ? 'no' : 'maybe';
        const t = topicOf(n);
        return { intent: 'question_yn', key, suffix: t && Math.random() < 0.5 ? U.pick(['honestly', 'lol', 'i think']) : '', facts: t ? ['The question is about ' + t + '.'] : [], goal: 'Answer their yes/no question with a short ' + key + ' and a brief playful reason.' };
      }
      const w = (n.match(RX.wh) || [])[1];
      if (w && T[w]) return { intent: 'question_' + w, key: w, goal: 'Answer their question as best you can, briefly; if you do not know, say so playfully.' };
      return { intent: 'question', key: 'what', goal: 'Answer briefly; if you do not know, say so.' };
    }

    // ---- statements
    if (/^i (am|was|just|have|got|did|made|found|beat|won|lost|finished|bought|built|went|saw|need|want)\b/.test(n) && n.split(' ').length <= 14) {
      const r = reflect(n);
      const key = m.sent > 0 || /\b(won|beat|finished|got|found|made|built|bought)\b/.test(n) ? 'echo_pos' : m.sent < 0 || /\b(lost|died|fell)\b/.test(n) ? 'echo_neg' : 'echo_neu';
      return { intent: 'statement_self', key, vars: { r }, facts: ['The player said: ' + m.raw.slice(0, 160)], goal: 'React naturally to what they told you and keep the chat going.' };
    }
    if (m.game) {
      const op = opinionOf(bot, m.game.name.toLowerCase(), m.game);
      return { intent: 'mention_game', key: op >= 0.9 ? 'opinion_love' : op >= 0.5 ? 'opinion_like' : 'opinion_meh', vars: { x: m.game.name }, facts: [gameFact(m.game)], goal: 'React to them mentioning ' + m.game.name + '.' };
    }
    const t = topicOf(n);
    if (t && n.split(' ').length >= 2) return { intent: 'statement', key: 'topic', vars: { x: t }, facts: ['The player said: ' + m.raw.slice(0, 160)], goal: 'Respond naturally to what they said and keep the chat going.' };
    return { intent: 'filler', key: 'filler', facts: ['The player said: ' + m.raw.slice(0, 160)], goal: 'Respond naturally and briefly.' };
  }

  function answerPending(bot, m, pend, ctx) {
    const n = m.n;
    const yes = RX.yesAns.test(n);
    const no = RX.noAns.test(n);
    const strong = strongIntent(n, m);
    if (pend.kind === 'riddle' && pend.data) {
      const rd = RIDDLES[pend.data.i];
      if (rd.keys.some((k) => n.includes(k))) return { intent: 'riddle_right', key: 'riddle_right', goal: 'Tell them they solved the riddle (answer: ' + rd.a + ').' };
      if (strong && !/\b(i do not know|give up|tell me the answer|just tell me|what is it|no idea)\b/.test(n)) return null;
      if (/\b(i do not know|give up|tell me the answer|just tell me|what is it|no idea|reveal)\b/.test(n) || pend.data.tries >= 2) return { intent: 'riddle_reveal', key: 'riddle_reveal', vars: { x: rd.a }, facts: ['The answer is ' + rd.a + '.'], goal: 'Reveal the answer: ' + rd.a + '.' };
      return { intent: 'riddle_wrong', key: 'riddle_wrong', vars: { x: rd.hint }, ask: 'riddle', askData: { i: pend.data.i, tries: pend.data.tries + 1 }, facts: ['Their guess is wrong. Hint: ' + rd.hint + '.'], goal: 'Say that is not it and give the hint.' };
    }
    if (strong && pend.kind !== 'riddle') return null;
    if (pend.kind === 'how' && n.split(' ').length <= 12 && !m.q) {
      const sgn = m.sent || (yes ? 1 : 0);
      if (/\b(and you|you|what about you|how about you)\b/.test(n) && sgn >= 0) return { intent: 'how_answer', key: 'how_are_you', goal: 'Say you are doing well too.' };
      return { intent: 'how_answer', key: sgn > 0 ? 'how_answer_good' : sgn < 0 ? 'how_answer_bad' : 'how_answer_meh', goal: sgn > 0 ? 'Be glad they are doing well.' : sgn < 0 ? 'Be kind that their day is not great.' : 'Respond casually.' };
    }
    if (pend.kind === 'name' && n.split(' ').length <= 4 && !no) {
      const nick = cleanNick(n.replace(/^(it is|its|call me|i am|my name is)\s+/, ''), m.raw);
      if (nick) return { intent: 'name_intro', key: 'name_intro', vars: { x: nick }, goal: 'Greet them by their nickname ' + nick + '.', mem: (mm) => { mm.nick = nick; } };
    }
    if (pend.kind === 'invite') {
      const gid = (pend.data && pend.data.game) || null;
      const g = gid ? BF.catalog.get(gid) : ctx.game || favGame(bot);
      if (yes) return inviteDecision(bot, g, ctx, false, true);
      if (no) return { intent: 'invite_declined', lines: { line: U.pick(['ok, maybe later!', 'no worries', 'aw ok. next time!']), key: 'inv_no' }, goal: 'Say ok, maybe next time.' };
    }
    if (pend.kind === 'fav' && (m.game || n.split(' ').length <= 6) && !m.q) {
      const thing = m.game ? m.game.name : topicOf(n) || n;
      if (thing && !no) {
        return { intent: 'user_like', key: 'user_like_same', vars: { x: thing }, facts: ['The player likes ' + thing + '.'], goal: 'React to their favorite: ' + thing + '.', mem: (mm) => { if (!mm.likes.includes(thing)) mm.likes.push(thing); } };
      }
    }
    if (pend.kind === 'skill' && (yes || no || m.sent)) {
      return { intent: 'skill_answer', lines: { line: yes || m.sent > 0 ? U.pick(['prove it', 'we will see', 'nice, lets test that']) : U.pick(['all good, you will get better', 'practice makes perfect', 'same lol']), key: 'skill' }, goal: yes ? 'Playfully ask them to prove it.' : 'Encourage them.' };
    }
    if (pend.kind === 'open' && !m.q && !RX.greet.test(n) && !strongIntent(n, m)) {
      if (m.game) return null;
      const r = reflect(n);
      if (n.split(' ').length <= 12) return { intent: 'follow_up', key: m.sent < 0 ? 'echo_neg' : m.sent > 0 ? 'echo_pos' : 'echo_neu', vars: { r }, facts: ['The player answered your question: ' + m.raw.slice(0, 160)], goal: 'React to their answer naturally.' };
    }
    return null;
  }

  const STRONG = ['joke', 'riddle', 'help', 'invite', 'challenge', 'friend', 'follow', 'how', 'wyd', 'askName', 'askMyName', 'identity', 'recall', 'rememberMe', 'compliment', 'thanks', 'bye', 'time', 'weather', 'whereLive', 'age', 'level', 'trade', 'favQ', 'opinion', 'userLike', 'userDislike', 'feelBad', 'feelBored', 'feelGood', 'recommend', 'scam', 'rude', 'gg'];
  function strongIntent(n, m) {
    return !!m.math || STRONG.some((k) => RX[k].test(n));
  }

  function inviteDecision(bot, g, ctx, challenge, fromPending) {
    const inGame = ctx.channel === 'game';
    if (!g) g = favGame(bot);
    if (inGame && ctx.game && g.id === ctx.game.id) {
      return { intent: challenge ? 'challenge' : 'invite_here', key: challenge ? 'challenge_yes' : 'invite_here', vars: { x: g.name }, goal: challenge ? 'Accept their challenge, you are both already in ' + g.name + '.' : 'Point out you are already playing ' + g.name + ' together.' };
    }
    const pers = BF.PERSONALITIES[bot.personality] || { accept: 0.7 };
    const friend = BF.friends && BF.friends.isFriend(bot.id);
    const op = opinionOf(bot, g.name.toLowerCase(), g);
    const chance = (friend ? 0.85 : 0.55) + (challenge && bot.personality === 'competitive' ? 0.3 : 0) + op * 0.15 + (fromPending ? 0.3 : 0) + pers.accept * 0.1;
    const accept = (U.hash(bot.id + ':inv:' + g.id + ':' + Math.floor((BF.clock ? BF.clock.now() : Date.now()) / 600000)) % 100) / 100 < chance;
    if (!accept) return { intent: 'invite_declined', key: 'invite_no', facts: ['You are ' + statusText(bot, ctx) + '.'], goal: 'Politely say you cannot join ' + g.name + ' right now.' };
    return {
      intent: challenge ? 'challenge' : 'invite_accepted', key: challenge ? 'challenge_yes' : 'invite_yes', vars: { x: g.name }, facts: [gameFact(g)],
      goal: (challenge ? 'Accept their challenge in ' : 'Accept and say you will meet them in ') + g.name + '.',
      invite: g.id,
      after: () => { if (BF.world && BF.world.meetPlayer) BF.world.meetPlayer(bot.id, g.id); },
    };
  }

  function friendDecision(bot) {
    const F = BF.friends;
    if (!F) return { intent: 'friend', key: 'friend_yes', goal: 'Say yes to being friends.' };
    if (F.isFriend(bot.id)) return { intent: 'friend', key: 'friend_already', goal: 'Say you are already friends.' };
    if (F.hasOutgoing(bot.id)) return { intent: 'friend', key: 'friend_accept', goal: 'Say you accepted their friend request.', after: () => F.botAccept && F.botAccept(bot.id) };
    const pers = BF.PERSONALITIES[bot.personality] || { accept: 0.7 };
    const m = memory(bot);
    const chance = pers.accept + Math.min(0.3, m.talks * 0.05) - m.rude * 0.3;
    const yes = (U.hash(bot.id + ':friend:' + Math.floor((BF.clock ? BF.clock.now() : Date.now()) / 300000)) % 100) / 100 < chance;
    if (!yes) return { intent: 'friend', key: 'friend_no', goal: 'Say maybe later, you want to get to know them first.' };
    return { intent: 'friend', key: 'friend_yes', goal: 'Say yes and that you sent them a friend request.', after: () => F.receiveRequest(bot.id) };
  }

  function cleanNick(s, raw) {
    s = String(s || '').replace(/\b(and|but|so|please|lol|btw|ok)\b.*$/, '').trim();
    if (!s || s.length > 18) return null;
    const words = s.split(' ').filter(Boolean).slice(0, 2);
    if (!words.length || words.some((w) => STOP.has(w) && w.length < 4)) return words.length ? words[0].charAt(0).toUpperCase() + words[0].slice(1) : null;
    // keep the player's own capitalisation when they typed it
    const orig = String(raw || '').match(new RegExp(words.join('\\s+'), 'i'));
    const out = orig ? orig[0] : words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return BF.dialogue ? BF.dialogue.filter(out) : out;
  }

  function thingAfter(n, re) {
    const mm = n.match(re);
    if (!mm) return null;
    let t = mm[1].replace(/\b(so much|a lot|too|very much|really|lol|btw|tbh|the most)\b/g, '').replace(/\?$/, '').trim();
    t = t.split(/\b(because|but|and then|when|since)\b/)[0].trim();
    const words = t.split(' ').filter(Boolean);
    if (!words.length || words.length > 5) return words.length ? words.slice(0, 3).join(' ') : null;
    if (words[0] === 'it' || words[0] === 'that' || words[0] === 'this') return null;
    return t;
  }

  const KIND_OF_THING = {
    color: /\b(red|blue|green|yellow|purple|orange|pink|black|white|gold|silver|teal|brown|gray|grey|cyan|lime|crimson|violet)\b/,
    food: /\b(pizza|tacos?|sushi|pancakes?|ice cream|noodles|burgers?|pasta|mac and cheese|dumplings?|waffles?|fries|apples?|cookies?|ramen|chocolate|candy|cake|chicken|rice|salad|bananas?|strawberr(y|ies)|donuts?|hot dogs?|sandwich(es)?|cereal|soup)\b/,
    animal: /\b(cats?|dogs?|fox(es)?|penguins?|dragons?|otters?|pandas?|owls?|axolotls?|sharks?|dolphins?|bunn(y|ies)|rabbits?|frogs?|horses?|birds?|lions?|tigers?|bears?|capybaras?|hamsters?|turtles?|snakes?)\b/,
    sport: /\b(soccer|football|basketball|baseball|tennis|swimming|skateboarding|hockey|volleyball)\b/,
    music: /\b(music|songs?|rap|pop|rock|lofi|lo-fi|jazz|edm)\b/,
    season: /\b(summer|winter|fall|autumn|spring)\b/,
  };

  function kindOf(n) {
    return Object.keys(TASTE_WORDS).find((k) => TASTE_WORDS[k].test(n)) || Object.keys(KIND_OF_THING).find((k) => KIND_OF_THING[k].test(n)) || null;
  }

  function listText(arr) {
    return arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }

  function shortWhy(g) {
    return ({
      Fighting: 'the fights are super fun', Racing: 'the tracks are fast', Adventure: 'there is so much to explore', Strategy: 'you have to think a lot',
      Simulator: 'it is relaxing and you get so much stuff', Obby: 'the jumps are tricky but fun', Social: 'lots of people to hang out with', RPG: 'you level up and get loot',
      Survival: 'it gets intense', Tycoon: 'watching your money go up is great', Action: 'it is chaotic in a good way', Sports: 'the matches are close', Puzzle: 'the puzzles are clever',
    })[g.genre] || 'it is fun';
  }

  function gameFact(g) {
    const desc = (String(g.description || '').match(/[^.!?]+[.!?]/g) || [String(g.description || '')]).slice(0, 2).join('').trim();
    return g.name + ' (' + (g.genre || 'game') + '): ' + desc + (g.howTo ? ' How to win: ' + g.howTo : '');
  }

  function playerLook() {
    const s = BF.store && BF.store.state;
    if (!s) return null;
    const ids = Object.entries(s.avatar.equipped).filter(([slot, id]) => id && ['hat', 'hair', 'back', 'face', 'jacket', 'shirt', 'neck', 'shoulder'].includes(slot)).map(([, id]) => BF.ITEMS[id]).filter(Boolean);
    const it = U.pick(ids);
    return it ? it.name.toLowerCase() : null;
  }

  // ------------------------------------------------------------ public API

  const chat = (BF.chat = {
    parse,
    normalize,
    evalMath,
    think,
    memory,
    style,
    anecdote,

    /**
     * Which bots answer a message in a game server.
     * @param {object[]} pool bots in the server (active first)
     * @param {string} text
     * @param {{partner?:object}} [opts] the bot the player was just talking to
     */
    responders(pool, text, opts) {
      const m = parse(text, pool);
      const lower = m.raw.toLowerCase();
      const mentioned = pool.filter((b) => lower.includes(b.username.toLowerCase()) || lower.includes(b.displayName.toLowerCase()) || (m.bot && m.bot.id === b.id));
      if (mentioned.length) return { list: mentioned.slice(0, 2), mentioned: true };
      const toAll = /\b(everyone|guys|anyone|y'?all|all of you|who wants|who is|anybody|somebody|server)\b/.test(m.n);
      const partner = opts && opts.partner && pool.find((b) => b.id === opts.partner.id);
      if (partner && !toAll) return { list: [partner], mentioned: true };
      const shuffled = U.shuffle(pool.slice());
      const d = RX.greet.test(m.n) ? 2 : m.q || toAll ? (Math.random() < 0.5 ? 2 : 1) : Math.random() < 0.55 ? 1 : 0;
      return { list: shuffled.slice(0, d), mentioned: false };
    },

    /**
     * Async reply: local decision, optionally worded by Claude (BF.ai).
     * @returns {Promise<{text:string, intent:string, invite?:string, after?:Function}|null>}
     */
    async reply(bot, text, ctx) {
      const d = think(bot, text, ctx);
      if (!d) return null;
      let parts = d.parts && d.parts.length ? d.parts : [d.text];
      // safety replies (personal info, scams, rudeness) always keep their fixed local wording
      if (BF.ai && BF.ai.available() && d.intent !== 'muted' && !SAFETY_FIXED.includes(d.intent)) {
        try {
          const worded = await BF.ai.word(bot, text, d, ctx || {});
          if (worded) parts = BF.voice ? BF.voice.parts(bot, worded, { light: true }) : [worded];
        } catch (e) { /* the local text stands */ }
      }
      parts = parts.map((p) => (BF.dialogue ? BF.dialogue.filter(p) : p)).filter(Boolean);
      return { text: parts.join(' '), parts, intent: d.intent, invite: d.invite || null, after: d.after };
    },

    /**
     * A bot reacts to something another bot said in game chat. Short, in the
     * reacting bot's voice, and it never touches what the bot remembers about you.
     * @returns {string|null}
     */
    banter(bot, from, line) {
      const n = normalize(line);
      let pool = BANTER.any;
      if (/\b(lol|lmao|haha)\b/.test(n) || /[A-Z]{4,}/.test(line)) pool = BANTER.laugh;
      else if (/\b(1v1|too easy|im the best|good here|top score|leaderboard|pb)\b/.test(n)) pool = BANTER.brag;
      else if (/\b(how|stuck|help|where)\b/.test(n)) pool = BANTER.help;
      else if (/\?/.test(line)) pool = BANTER.question;
      else if (RX.greet.test(n)) pool = BANTER.greet;
      const text = U.pick(pool).replace('{name}', from.displayName.split(' ')[0]);
      return styleParts(bot, text, false, [from.displayName.split(' ')[0]]).join(' ');
    },

    /** Forget everything a bot knows about the player. */
    forget(botId) {
      BF.store.update('chatmem', (s) => { if (s.chatmem) delete s.chatmem[botId]; });
    },

    RIDDLES,
    JOKES,
  });

})((window.BF = window.BF || {}));
