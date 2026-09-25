/**
 * BlockForge — optional Claude wording for bot replies.
 *
 * In the published claude.ai viewer the page can ask Claude through the
 * `sample` capability: the viewer is asked once, and calls use the viewer's
 * own Claude usage. The local chat engine (BF.chat) still decides what a bot
 * does and knows the facts; Claude only turns that decision into a natural
 * line in the bot's voice. Opened from disk, declined, or switched off in
 * Settings, every reply stays local. Calls happen only when the player sends a
 * message, never from timers.
 */
(function (BF) {
  'use strict';

  let sample = null;
  let state = 'unknown'; // unknown | ready | off
  let pausedUntil = 0;
  const HIDE = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];

  const VOICE = {
    competitive: 'confident and a little cocky, short punchy sentences, loves challenges and winning, playful trash talk but never mean',
    friendly: 'warm and upbeat, welcoming, uses the odd :) or :D, encourages people',
    explorer: 'curious and chatty about secrets, hidden places and discoveries, asks questions',
    collector: 'obsessed with rare items, hats and the Avatar Shop, notices what people wear',
    chaotic: 'random, silly and loud, sometimes CAPS, jokes a lot, never rude',
    beginner: 'new to BlockForge, lowercase, simple words, asks for help, a bit unsure',
    builder: 'loves making games in the Studio, talks about maps, levels and design',
    speedrunner: 'terse, obsessed with times, personal bests and shortcuts',
    roleplayer: 'theatrical, sometimes adds actions in *asterisks*, treats games like adventures',
    helper: 'patient mentor who gives clear, kind tips, writes in full sentences',
  };

  function setting() {
    const s = BF.store && BF.store.state;
    return s && s.settings.gameplay.botAI ? s.settings.gameplay.botAI : 'smart';
  }

  function init() {
    try {
      if (typeof window === 'undefined' || !window.claude || typeof window.claude.use !== 'function') { state = 'off'; return; }
      window.claude.use('sample').then((fn) => {
        sample = typeof fn === 'function' ? fn : null;
        state = sample ? 'ready' : 'off';
        if (BF.bus) BF.bus.emit('ai:changed', { state });
      }, () => { state = 'off'; });
    } catch (e) {
      state = 'off';
    }
  }

  function clean(text, bot) {
    let t = String(text || '').trim().split(/\n+/)[0].trim();
    t = t.replace(/^["'“”]+|["'“”]+$/g, '').trim();
    const prefix = new RegExp('^(' + bot.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|' + bot.username + '|@' + bot.username + ')\\s*:\\s*', 'i');
    t = t.replace(prefix, '');
    if (t.length > 220) t = t.slice(0, 217).replace(/\s+\S*$/, '') + '...';
    return t || null;
  }

  function instructions(bot, decision, ctx) {
    const s = BF.store.state;
    const st = BF.bots.stats(bot);
    const favs = (bot.favoriteGames || []).map((id) => (BF.catalog.get(id) || {}).name).filter(Boolean).join(', ');
    const mem = BF.chat.memory(bot);
    const where = ctx.channel === 'game' && ctx.game ? 'in the text chat of the game "' + ctx.game.name + '" where you are both playing right now' : 'in private messages';
    const known = [];
    if (mem.nick) known.push('they like to be called ' + mem.nick);
    if (mem.likes.length) known.push('they like ' + mem.likes.slice(-4).join(', '));
    if (mem.dislikes.length) known.push('they dislike ' + mem.dislikes.slice(-3).join(', '));
    return [
      'You are role-playing a player character in BlockForge, a fictional, offline game platform full of blocky multiplayer games.',
      'Your character: ' + bot.displayName + ' (@' + bot.username + '), level ' + st.level + ', a "' + bot.personality + '" player: ' + (VOICE[bot.personality] || 'friendly') + '.',
      'Bio: "' + (bot.bio || '') + '". Favorite games: ' + (favs || 'many') + '.',
      'You are chatting with the player ' + (mem.nick || s.player.displayName) + ' (@' + s.player.username + ') ' + where + '.',
      known.length ? 'What you remember about them: ' + known.join('; ') + '.' : '',
      decision.facts && decision.facts.length ? 'Facts you can rely on: ' + decision.facts.join(' ') : '',
      decision.goal ? 'What to do in this reply: ' + decision.goal : '',
      'Write ONE short chat message (at most 25 words) the way a real player types in game chat: casual, in character, no hashtags, no links, no lists.',
      'Keep it friendly and safe for kids. Never ask for or repeat personal information (real name, age, address, school, phone, passwords); if they share some, gently tell them to keep it private.',
      'If they sincerely ask whether you are a bot or an AI, say honestly that you are a BlockForge bot.',
      'ForgeCoins are fictional: never promise to give coins or items, and warn that "free coins" offers are scams. Do not invent BlockForge features.',
      'Reply with only the message text.',
    ].filter(Boolean).join('\n');
  }

  BF.ai = {
    /** 'unknown' while starting, 'ready' when Claude can be asked, 'off' otherwise. */
    status() { return state; },

    /** True when replies should be worded by Claude right now. */
    available() {
      return state === 'ready' && !!sample && setting() !== 'local' && Date.now() >= pausedUntil;
    },

    /**
     * Word a bot's reply with Claude.
     * @param {object} bot
     * @param {string} text what the player said
     * @param {object} decision from BF.chat.think()
     * @param {{channel?:string, game?:object, history?:{from:string,text:string}[]}} ctx
     * @returns {Promise<string|null>}
     */
    async word(bot, text, decision, ctx) {
      if (!BF.ai.available()) return null;
      const turns = [{ role: 'user', content: instructions(bot, decision, ctx) }];
      for (const h of (ctx.history || []).slice(-8)) {
        const content = String(h.text || '').slice(0, 300);
        if (content) turns.push({ role: h.from === 'me' ? 'user' : 'assistant', content });
      }
      turns.push({ role: 'user', content: String(text).slice(0, 400) });
      try {
        const res = await sample(turns, { modelTier: 'quick', cache: false });
        return clean(res && res.text, bot);
      } catch (e) {
        const code = e && e.code;
        if (HIDE.includes(code)) { state = 'off'; if (BF.bus) BF.bus.emit('ai:changed', { state }); }
        else if (code === 'rate_limited') pausedUntil = Date.now() + 60000;
        return null;
      }
    },

    VOICE,
  };

  init();
})((window.BF = window.BF || {}));
