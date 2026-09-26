/**
 * BlockForge — in-game orders: bots act on what you say.
 *
 *   BF.orders.parse(text, bots, opts) -> {verb, arg, targets[], all} | null
 *   BF.orders.willing(bot, order)     -> true | false  (personality, friendship, manners)
 *   BF.orders.ack(bot, order, ok, supported) -> chat line
 *
 * Verbs: follow, come, stay, leave, free, ally, attack, help, emote, jump,
 * race, build, pass, gather. The runtime keeps the current order per bot
 * (ctx.botOrder(id)); each game module's bot AI reads it and declares which
 * verbs it supports (module.orders). Emotes and jumps work in every 3D game.
 */
(function (BF) {
  'use strict';

  const U = BF.util;

  const RX = {
    all: /\b(every ?one|every ?body|guys|all of you|y'?all|you all|team|squad|anyone|some ?one|somebody)\b/,
    free: /\b(do your (own )?thing|you'?re free|carry on|never ?mind|as you were|go play|stop that)\b/,
    leave: /\b(go away|leave me alone|stop following( me)?|back off|get lost|shoo)\b/,
    follow: /\b(follow me|come with me|stick with me|stay with me|tag along|keep up|lead the way|follow)\b/,
    come: /\b(come here|come to me|come over|over here|get over here|come back|find me|where are you|join me here|meet me)\b/,
    stay: /\b(stay( there| here| put)?|wait( here| there| for me)?|stop( moving)?|hold (on|up|position)|don'?t move|freeze)\b/,
    ally: /\b(team up|be my (teammate|ally|partner|duo)|let'?s team|truce|don'?t (attack|hit|shoot|kill) me|be on my team|join my team|work together|let'?s duo)\b/,
    duel: /\b(fight me|1v1 me|duel me|attack me|hit me|come at me|battle me|1v1)\b/,
    attack: /\b(attack|fight|get|kill|hit|go after|target|shoot|chase|eliminate|bonk)\s+(@?[a-z0-9_]+)/,
    help: /\b(help me|help|assist( me)?|protect me|guard me|cover me|defend me|back me up|save me|heal me)\b/,
    race: /\b(race me|race|let'?s race|beat me to)\b/,
    build: /\b(build|place|make) (a |an |some |more |another )?(tower|towers|defen[cs]es?|walls?|turrets?|archers?|cannons?)\b/,
    pass: /\b(pass( me)?( the ball| it)?|cross it|give me the ball)\b/,
    gather: /\b(gather|collect|mine|farm|chop|dig)\b(\s+(some |the |more )?([a-z]+))?/,
    jump: /\b(jump|hop)\b/,
    emote: /\b(dance|wave|cheer|salute|laugh|spin|flex|do the robot|robot dance|jumping jacks|do jacks)\b/,
  };
  const EMOTE_WORD = { dance: 'dance', wave: 'wave', cheer: 'cheer', salute: 'salute', laugh: 'laugh', spin: 'spin', flex: 'flex', 'do the robot': 'robot', 'robot dance': 'robot', 'jumping jacks': 'jacks', 'do jacks': 'jacks' };
  const ORDER = ['free', 'leave', 'duel', 'ally', 'attack', 'help', 'follow', 'come', 'stay', 'race', 'build', 'pass', 'gather', 'emote', 'jump'];

  /** Which bot names appear in the text (display name, its first word, or username). */
  function mentioned(n, bots) {
    const out = [];
    for (const b of bots) {
      const names = [b.displayName.toLowerCase(), b.displayName.toLowerCase().split(' ')[0], b.username.toLowerCase()];
      if (names.some((x) => x.length >= 3 && new RegExp('(^|[^a-z0-9])@?' + x.replace(/[^a-z0-9 ]/g, '') + '([^a-z0-9]|$)').test(n))) out.push(b);
    }
    return out;
  }

  const orders = (BF.orders = {
    RX,
    /**
     * Read an instruction out of a chat line.
     * opts: {partner (bot id recently talking), nearest (bot)}
     */
    parse(text, bots, opts) {
      opts = opts || {};
      const n = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9@' ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
      let verb = null, arg = null;
      for (const v of ORDER) {
        const m = n.match(RX[v]);
        if (!m) continue;
        verb = v;
        if (v === 'attack') arg = m[2];
        if (v === 'emote') arg = EMOTE_WORD[m[1]] || m[1];
        if (v === 'gather') arg = m[4] || null;
        if (v === 'build') arg = m[3];
        break;
      }
      if (!verb) return null;
      if (verb === 'duel') { verb = 'attack'; arg = 'me'; }
      const named = mentioned(n, bots);
      // "attack Mocha" names the target, not who should do it
      let targetBot = null;
      if (verb === 'attack' && arg && arg !== 'me') {
        targetBot = mentioned(' ' + arg + ' ', bots)[0] || null;
        if (!targetBot && !['him', 'her', 'them', 'that', 'it', 'everyone'].includes(arg)) return null;
      }
      const doers = named.filter((b) => b !== targetBot);
      const all = RX.all.test(n) && !doers.length;
      let targets = doers;
      if (!targets.length) {
        if (all) targets = /\b(some ?one|somebody|anyone)\b/.test(n) ? bots.slice(0, 1) : bots.slice();
        else if (opts.partner) targets = bots.filter((b) => b.id === opts.partner).slice(0, 1);
        if (!targets.length && opts.nearest) targets = [opts.nearest];
        if (!targets.length && bots.length) targets = [bots[0]];
      }
      return { verb, arg, target: targetBot ? targetBot.id : arg === 'me' ? 'me' : null, targets: targets.slice(0, 6), all };
    },

    /** Will this bot do it? Friends, friendly personalities and polite players get more yeses. */
    willing(bot, order, rng) {
      const r = rng || Math.random;
      const base = { friendly: 0.95, helper: 0.97, beginner: 0.9, roleplayer: 0.9, explorer: 0.85, builder: 0.85, collector: 0.8, speedrunner: 0.7, competitive: 0.65, chaotic: 0.5 }[bot.personality] || 0.8;
      let p = base;
      if (BF.friends && BF.friends.isFriend(bot.id)) p += 0.2;
      if (order.verb === 'ally' || order.verb === 'help') p -= bot.personality === 'competitive' ? 0.25 : 0;
      if (order.verb === 'attack' && order.target === 'me') p = bot.personality === 'competitive' ? 1 : p;
      if (order.verb === 'leave' || order.verb === 'free' || order.verb === 'stay') p = Math.max(p, 0.9);
      if (order.verb === 'emote' || order.verb === 'jump') p = Math.max(p, 0.85);
      const m = BF.chat && BF.chat.memory ? BF.chat.memory(bot) : null;
      if (m && m.rude) p -= m.rude * 0.25;
      return r() < U.clamp(p, 0.05, 1);
    },

    /** The bot's answer. */
    ack(bot, order, ok, supported) {
      const who = order.target && order.target !== 'me' && BF.bots.get(order.target);
      const L = !supported ? ['cant really do that in this game', 'not sure how to do that here lol', 'this game doesnt let me do that'] : !ok ? {
        follow: ['nah im busy rn', 'maybe later', 'im doing my own thing sorry'],
        come: ['cant rn', 'one sec... actually no lol', 'busy!'],
        ally: ['no teams, every player for themself', 'nope, may the best player win', 'hmm no'],
        attack: ['nah', 'not my fight', 'i dont want to'],
        help: ['sorry, you got this!', 'i cant rn', 'im in trouble too lol'],
        race: ['not now', 'maybe next round'],
        build: ['saving my gold', 'not yet'],
        pass: ['im going for it myself!', 'nope, my ball'],
        gather: ['im busy with something else', 'maybe later'],
        emote: ['no lol', 'too shy'],
        jump: ['nah'],
      }[order.verb] || ['no thanks'] : {
        follow: ['ok following you!', 'right behind you', 'lead the way!', 'coming, wait up'],
        come: ['on my way!', 'omw', 'coming!', 'where r u? ok i see you'],
        stay: ['ok ill wait here', 'staying put', 'k im not moving'],
        leave: ['ok ok im going', 'fine, see ya', 'k bye'],
        free: ['ok, back to doing my thing', 'cool', 'k'],
        ally: ['deal, team up!', 'truce! lets get the others', 'ok were a team now'],
        attack: [order.target === 'me' ? 'you asked for it!' : 'going after ' + (who ? who.displayName : 'them') + '!', 'on it!', 'target locked'],
        help: ['got your back!', 'im coming to help', 'ill protect you'],
        race: ['you are ON', 'race you!', 'lets goooo'],
        build: ['building one now', 'ok placing a tower', 'on it'],
        pass: ['passing!', 'here, take it', 'heads up!'],
        gather: ['ok gathering!', 'on it', 'will do'],
        emote: ['*' + (order.arg || 'dance') + 's*', 'ok ok', 'like this?'],
        jump: ['*jumps*', 'boing', 'like this?'],
      }[order.verb] || ['ok'];
      return BF.dialogue ? BF.dialogue.styleFor(bot, U.pick(L)) : U.pick(L);
    },

    /**
     * Movement for walking bots under an order. Returns null (no order: normal AI),
     * {hold: true} (stand still) or {x, y} (walk there). `me` is the player's position;
     * opts: {near (px to stop at), away (px to retreat), bounds: {x0, y0, x1, y1}}.
     */
    goal(ctx, botId, pos, me, opts) {
      const o = ctx && ctx.botOrder ? ctx.botOrder(botId) : null;
      if (!o || !me) return null;
      opts = opts || {};
      const near = opts.near || 50;
      const clampB = (p) => { const b = opts.bounds; if (b) { p.x = U.clamp(p.x, b.x0, b.x1); p.y = U.clamp(p.y, b.y0, b.y1); } return p; };
      if (o.verb === 'stay') return { hold: true, order: o };
      if (o.verb === 'follow' || o.verb === 'help' || o.verb === 'come' || o.verb === 'ally') {
        // each follower keeps its own slot around the player so they do not bunch up
        const a = (U.hash(botId) % 8) * (Math.PI / 4);
        const slot = clampB({ x: me.x + Math.cos(a) * near, y: me.y + Math.sin(a) * near });
        const d = Math.hypot(slot.x - pos.x, slot.y - pos.y);
        if (o.verb === 'come' && Math.hypot(me.x - pos.x, me.y - pos.y) < near * 1.5) { ctx.clearOrder(botId); return { hold: true, order: o }; }
        if (o.verb === 'ally' && Math.hypot(me.x - pos.x, me.y - pos.y) > near * 6) return null;
        return d < 10 ? { hold: true, order: o } : { x: slot.x, y: slot.y, order: o };
      }
      if (o.verb === 'leave') {
        const dx = pos.x - me.x, dy = pos.y - me.y, l = Math.hypot(dx, dy) || 1;
        if (l > (opts.away || 320)) return null;
        return clampB({ x: pos.x + (dx / l) * 120, y: pos.y + (dy / l) * 120, order: o });
      }
      return null;
    },

    /** How long an order lasts before the bot goes back to normal (seconds). */
    duration(verb) {
      return { follow: 150, come: 40, stay: 60, leave: 30, ally: 240, attack: 45, help: 120, race: 90, build: 5, pass: 4, gather: 90, emote: 3, jump: 1 }[verb] || 30;
    },
  });
})((window.BF = window.BF || {}));
