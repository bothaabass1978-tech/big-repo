/**
 * BlockForge — how each bot types.
 *
 * The chat engine (systems/chat.js) decides what a bot says; this turns it
 * into the way that particular person types. Every bot gets a stable voice
 * from its id and personality: lower case or not, "u" for "you", dropped
 * apostrophes, a favourite laugh, two pet words ("ngl", "lowkey", "bro"...),
 * how often they stretch words ("sooo"), how sloppy they are (typos they
 * sometimes fix with a "*word" follow-up) and whether they send one long
 * message or several short ones.
 *
 *   BF.voice.profile(bot)          the bot's voice (stable)
 *   BF.voice.say(bot, text, opts)  one styled line
 *   BF.voice.parts(bot, text, opts) styled line split into chat bubbles
 *   BF.voice.describe(bot)         a sentence about the voice (for Claude wording)
 *
 * `opts.serious` keeps safety messages plain and in one piece. `opts.rng` is
 * injectable for tests.
 */
(function (BF) {
  'use strict';

  const U = BF.util;

  const LAUGHS = ['lol', 'lmao', 'haha', 'LOL', 'lmaooo', 'hahaha', 'xD', 'hehe', 'lool', 'LMAO'];
  const PET = ['ngl', 'tbh', 'fr', 'lowkey', 'honestly', 'bro', 'dude', 'like', 'ok so', 'wait', 'literally', 'yo', 'bruh', 'deadass', 'no cap', 'omg'];
  /** Words people shorten. Applied by a bot only if its voice shortens words. */
  const SHORT = [
    [/\bi am\b/g, 'im'], [/\bi'm\b/gi, 'im'], [/\bdo not\b/g, 'dont'], [/\bdoes not\b/g, 'doesnt'], [/\bdid not\b/g, 'didnt'],
    [/\bcannot\b/g, 'cant'], [/\bwill not\b/g, 'wont'], [/\bis not\b/g, 'isnt'], [/\bare not\b/g, 'arent'],
    [/\bgoing to\b/g, 'gonna'], [/\bwant to\b/g, 'wanna'], [/\bgot to\b/g, 'gotta'], [/\bkind of\b/g, 'kinda'],
    [/\bbecause\b/g, 'bc'], [/\bprobably\b/g, 'prob'], [/\bthough\b/g, 'tho'], [/\bright now\b/g, 'rn'],
    [/\bto be honest\b/g, 'tbh'], [/\bi do not know\b/g, 'idk'], [/\bi don't know\b/g, 'idk'], [/\bidk\b/g, 'idk'],
    [/\boh my (god|gosh)\b/g, 'omg'], [/\bokay\b/g, 'ok'], [/\bplease\b/g, 'pls'], [/\btomorrow\b/g, 'tmrw'],
    [/\bby the way\b/g, 'btw'], [/\bnot gonna lie\b/g, 'ngl'], [/\bsomething\b/g, 'smth'], [/\bwhat is\b(?= \w)/g, 'whats'],
    [/\bthat is\b(?= \w)/g, 'thats'], [/\bit is\b(?= \w)/g, 'its'], [/\byou are\b(?= \w)/g, 'youre'], [/\bthey are\b(?= \w)/g, 'theyre'],
    [/\blet us\b/g, 'lets'], [/\bwe are\b(?= \w)/g, 'were'],
  ];
  const STRETCH = [[/\bso\b/, 'sooo'], [/\byes\b/, 'yesss'], [/\bno\b/, 'nooo'], [/\bomg\b/, 'omggg'], [/\bwhat\b/, 'whaaat'], [/\bnice\b/, 'niceee'], [/\bgood\b/, 'goood'], [/\bokay\b|\bok\b/, 'okk'], [/\bplease\b|\bpls\b/, 'plsss'], [/\bhey\b/, 'heyyy'], [/\bwait\b/, 'waitt']];
  const EMOTE_END = /([:;][)DPp(]|xD|XD|<3)\s*$/;

  const cache = new Map();

  const voice = (BF.voice = {
    LAUGHS,
    PET,

    /** A bot's stable typing voice. */
    profile(bot) {
      if (cache.has(bot.id)) return cache.get(bot.id);
      const r = U.rng('voice:' + bot.id);
      const p = bot.personality;
      const pick = (arr) => arr[Math.floor(r() * arr.length)];
      const v = {
        lower: p === 'helper' ? r() < 0.25 : r() < 0.82,
        shout: p === 'chaotic' ? 0.22 : r() < 0.1 ? 0.06 : 0,
        u: p === 'helper' ? false : r() < 0.45,
        short: p === 'helper' ? r() < 0.3 : r() < 0.85,
        noApos: r() < 0.7,
        laugh: pick(p === 'chaotic' ? ['LMAO', 'LOL', 'xD', 'lmaooo'] : p === 'roleplayer' ? ['haha', 'hehe'] : LAUGHS),
        pets: [pick(PET), pick(PET)],
        petRate: p === 'helper' ? 0.05 : 0.12 + r() * 0.16,
        laughRate: p === 'competitive' ? 0.08 : 0.1 + r() * 0.16,
        stretch: p === 'chaotic' || p === 'friendly' ? 0.35 : r() * 0.2,
        typo: p === 'beginner' ? 0.18 : p === 'helper' ? 0.01 : 0.03 + r() * 0.07,
        fixTypo: r() < 0.55,
        split: p === 'speedrunner' ? 0.2 : 0.35 + r() * 0.4,
        dots: r() < 0.25,
        excl: p === 'friendly' || p === 'chaotic' ? 0.5 : r() * 0.25,
        faces: p === 'friendly' ? 0.25 : p === 'competitive' || p === 'speedrunner' ? 0 : r() * 0.1,
      };
      cache.set(bot.id, v);
      return v;
    },

    /** One sentence describing a bot's typing (used to brief Claude wording). */
    describe(bot) {
      const v = voice.profile(bot);
      const bits = [];
      bits.push(v.lower ? 'types in all lowercase' : 'uses normal capitals');
      if (v.u) bits.push('writes "u" and "ur"');
      if (v.short) bits.push('shortens words (im, dont, gonna, bc, rn)');
      bits.push('laughs with "' + v.laugh + '"');
      bits.push('often says "' + v.pets[0] + '" and "' + v.pets[1] + '"');
      if (v.stretch > 0.25) bits.push('stretches words like "sooo"');
      if (v.dots) bits.push('trails off with "..."');
      return bits.join(', ');
    },

    /**
     * Style one line in the bot's voice.
     * @param {object} bot
     * @param {string} text
     * @param {{serious?:boolean, rng?:Function, keep?:string[]}} [opts] keep: words never to lowercase or typo (names)
     */
    say(bot, text, opts) {
      return voice.parts(bot, text, Object.assign({ noSplit: true }, opts)).join(' ');
    },

    /**
     * Style a line and split it into the bubbles the bot would send.
     * @returns {string[]}
     */
    parts(bot, text, opts) {
      opts = opts || {};
      text = String(text || '').trim();
      if (!text) return [];
      const r = opts.rng || Math.random;
      const v = voice.profile(bot);
      const s = BF.store && BF.store.state;
      const keep = (opts.keep || []).concat(s ? [s.player.displayName, s.player.displayName.split(' ')[0], s.player.username] : []).filter(Boolean);
      if (opts.serious) {
        // safety lines stay clear and whole; only the case follows the voice
        return [v.lower && bot.personality !== 'helper' ? lowerKeep(text, keep) : text];
      }
      let t = text;
      // roleplay actions stay as they are
      const action = /^\*[^*]+\*\s*/.exec(t);
      if (action) t = t.slice(action[0].length);
      if (v.short) {
        const lower = t.toLowerCase();
        let out = t;
        for (const [re, rep] of SHORT) if (re.test(lower)) out = out.replace(new RegExp(re.source, 'gi'), rep);
        t = out;
      }
      if (v.u) t = t.replace(/\byou\b/gi, 'u').replace(/\byour\b/gi, 'ur').replace(/\byoure\b/gi, 'ur').replace(/\bare\b(?= u\b)/gi, 'r');
      if (v.noApos) t = t.replace(/(\w)'(\w)/g, '$1$2');
      if (v.lower) t = lowerKeep(t, keep);
      // Claude already wrote it in this voice: keep its words, only split it into bubbles
      if (opts.light) { if (action) t = action[0] + t; return opts.noSplit ? [t] : split(t, v, r); }
      // end punctuation: most people drop the full stop
      t = t.replace(/\.(\s*)$/, '$1');
      if (v.dots && r() < 0.25 && !/[?!]$/.test(t)) t += '...';
      if (/!$/.test(t) && r() > v.excl) t = t.replace(/!+$/, '');
      else if (/!$/.test(t) && r() < v.excl * 0.5) t = t.replace(/!+$/, '!!');
      // stretched words
      if (r() < v.stretch) {
        const cands = STRETCH.filter(([re]) => re.test(t));
        if (cands.length) { const [re, rep] = cands[Math.floor(r() * cands.length)]; t = t.replace(re, v.lower ? rep : rep); }
      }
      // pet words at the front, laughs at the back
      const statement = !/^(hi|hey|yo|hello|sup|bye|cya|gg|ok|lol|no|yes|yeah|nah)\b/i.test(t) && t.split(' ').length > 3;
      if (statement && r() < v.petRate) t = v.pets[Math.floor(r() * 2)] + ' ' + (v.lower ? t : t.charAt(0).toLowerCase() + t.slice(1));
      const laughed = /\b(lol|lmao\w*|haha\w*|xd|hehe)\b/i.test(t);
      if (!EMOTE_END.test(t) && !laughed && r() < v.laughRate) t += ' ' + v.laugh;
      else if (!EMOTE_END.test(t) && !laughed && r() < v.faces) t += ' ' + ['xD', ':)', ':D', ':P', ':3'][Math.floor(r() * 5)];
      if (v.shout && r() < v.shout && t.length < 60) t = t.toUpperCase();
      // a typo, sometimes fixed in a follow-up bubble
      let fix = null;
      if (r() < v.typo) {
        const words = t.split(' ');
        const idx = words.map((w, i) => (/^[a-z]{5,}$/i.test(w) && !keep.some((k) => k.toLowerCase().includes(w.toLowerCase())) && !properWords().has(w.toLowerCase()) ? i : -1)).filter((i) => i >= 0);
        if (idx.length) {
          const i = idx[Math.floor(r() * idx.length)];
          const orig = words[i];
          words[i] = typo(orig, r);
          if (words[i] !== orig) { t = words.join(' '); if (v.fixTypo && !opts.noSplit) fix = '*' + orig.toLowerCase(); }
        }
      }
      if (action) t = action[0] + t;
      let out = [t];
      if (!opts.noSplit) out = split(t, v, r);
      if (fix) out.push(fix);
      return out.filter(Boolean);
    },
  });

  /** Words from game names never get typos (people type names they know). */
  let proper = null;
  function properWords() {
    if (proper && proper.n === BF.GAME_REGISTRY.length) return proper.set;
    const set = new Set();
    for (const g of BF.GAME_REGISTRY) g.name.toLowerCase().split(/\s+/).forEach((w) => set.add(w));
    proper = { n: BF.GAME_REGISTRY.length, set };
    return set;
  }

  function lowerKeep(t, keep) {
    let out = t.toLowerCase();
    for (const k of keep) {
      if (!k) continue;
      const i = out.indexOf(k.toLowerCase());
      if (i >= 0) out = out.slice(0, i) + k + out.slice(i + k.length);
    }
    return out;
  }

  function typo(word, r) {
    const i = 1 + Math.floor(r() * (word.length - 3));
    const kind = r();
    if (kind < 0.5) return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2); // swap
    if (kind < 0.8) return word.slice(0, i) + word.slice(i + 1); // drop
    return word.slice(0, i) + word[i] + word.slice(i); // double
  }

  /** Split after sentence ends (and sometimes before "but"/"anyway") into up to 3 bubbles. */
  function split(t, v, r) {
    if (t.length < 28 || r() > v.split) return [t];
    const pieces = t.split(/(?<=[.!?])\s+(?=\S)|\s+(?=(?:but|anyway|also|wait|oh and)\b)/i).map((x) => x.trim()).filter(Boolean);
    if (pieces.length < 2) return [t];
    const out = [];
    for (const p of pieces) {
      if (out.length < 3) out.push(p.replace(/\.$/, ''));
      else out[2] += ' ' + p;
    }
    return out;
  }
})((window.BF = window.BF || {}));
