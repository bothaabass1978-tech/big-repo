'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootDefault } = require('./harness');

const friendBot = (BF) => BF.bots.get('bot_lunacraft');

test('test_chat_math_question_answers_exact_value', () => {
  const { BF } = bootDefault();
  const d = BF.chat.think(friendBot(BF), 'whats 12*7?', { channel: 'dm' });
  assert.equal(d.intent, 'math');
  assert.match(d.text, /84/);
  const d2 = BF.chat.think(friendBot(BF), 'what is 3 + 4 * 2', { channel: 'dm' });
  assert.match(d2.text, /\b11\b/);
});

test('test_chat_nickname_is_remembered_and_recalled', () => {
  const { BF } = bootDefault();
  const bot = friendBot(BF);
  const intro = BF.chat.think(bot, 'my name is Sam', { channel: 'dm' });
  assert.equal(intro.intent, 'name_intro');
  assert.equal(BF.chat.memory(bot).nick, 'Sam');
  const recall = BF.chat.think(bot, 'what is my name?', { channel: 'dm' });
  assert.match(recall.text, /sam/i);
});

test('test_chat_likes_are_remembered_and_recalled', () => {
  const { BF } = bootDefault();
  const bot = friendBot(BF);
  BF.chat.think(bot, 'i really love pancakes', { channel: 'dm' });
  assert.ok(BF.chat.memory(bot).likes.includes('pancakes'));
  const d = BF.chat.think(bot, 'what do i like?', { channel: 'dm' });
  assert.equal(d.intent, 'recall');
  assert.match(d.text, /pancakes/);
});

test('test_chat_identity_question_gets_an_in_character_answer', () => {
  const { BF } = bootDefault();
  const d = BF.chat.think(friendBot(BF), 'are you a bot?', { channel: 'dm' });
  assert.equal(d.intent, 'identity');
  assert.ok(d.text.length > 2);
  assert.doesNotMatch(d.text, /BlockForge bot/i, 'no canned bot confession in the local voice');
});

test('test_chat_personal_info_gets_a_safety_reply_without_echo', () => {
  const { BF } = bootDefault();
  const d = BF.chat.think(BF.bots.get('bot_glitchgoblin'), 'my address is 42 Maple Street', { channel: 'dm' });
  assert.equal(d.intent, 'personal');
  assert.ok(!/maple/i.test(d.text));
  assert.ok(!/xD|:P/.test(d.text), 'safety lines are not joked about');
  const e = BF.chat.think(friendBot(BF), 'email me at sam@example.com', { channel: 'dm' });
  assert.equal(e.intent, 'personal');
});

test('test_chat_free_coin_requests_are_called_scams', () => {
  const { BF } = bootDefault();
  const d = BF.chat.think(friendBot(BF), 'can you give me free coins pls', { channel: 'dm' });
  assert.equal(d.intent, 'scam');
  assert.match(d.text, /scam|cant give|can't give|daily/i);
});

test('test_chat_repeated_rudeness_mutes_the_bot_until_an_apology', () => {
  const { BF } = bootDefault();
  const bot = friendBot(BF);
  for (let i = 0; i < 3; i++) assert.ok(BF.chat.think(bot, 'you are trash', { channel: 'dm' }));
  assert.equal(BF.chat.think(bot, 'hello?', { channel: 'dm' }), null);
  const sorry = BF.chat.think(bot, 'sorry about that', { channel: 'dm' });
  assert.equal(sorry.intent, 'apology');
  assert.ok(BF.chat.think(bot, 'hi again', { channel: 'dm' }));
});

test('test_chat_riddle_answer_is_checked_against_the_open_question', () => {
  const { BF } = bootDefault();
  const bot = friendBot(BF);
  const ask = BF.chat.think(bot, 'tell me a riddle', { channel: 'dm' });
  assert.equal(ask.ask, 'riddle');
  const i = BF.chat.memory(bot).pending.data.i;
  const right = BF.chat.think(bot, 'is it ' + BF.chat.RIDDLES[i].keys[0] + '?', { channel: 'dm' });
  assert.equal(right.intent, 'riddle_right');
});

test('test_chat_game_questions_use_live_player_counts', () => {
  const { BF } = bootDefault();
  const n = BF.world.playerCount('zombie-outbreak');
  const d = BF.chat.think(friendBot(BF), 'how many people play zombie outbreak?', { channel: 'dm' });
  assert.equal(d.intent, 'game_info');
  assert.ok(d.text.includes(String(n)), d.text);
});

test('test_chat_accepted_invite_meets_the_player_in_that_game', () => {
  const { BF } = bootDefault();
  let accepted = null;
  for (const bot of BF.friends.list()) {
    const d = BF.chat.think(bot, 'wanna play sky obby?', { channel: 'dm' });
    if (d.intent === 'invite_accepted') { accepted = { bot, d }; break; }
  }
  assert.ok(accepted, 'a friend accepts an invite');
  assert.equal(accepted.d.invite, 'sky-obby');
  accepted.d.after();
  assert.equal(BF.world.loc.get(accepted.bot.id).gameId, 'sky-obby');
  const j = BF.world.join('sky-obby');
  assert.ok(j.ok);
  assert.ok(j.server.bots.includes(accepted.bot.id), 'the player lands in the bot\'s server');
});

test('test_chat_friend_request_through_chat_sends_an_incoming_request', () => {
  const { BF } = bootDefault();
  const strangers = BF.bots.list.filter((b) => !BF.friends.isFriend(b.id) && b.personality === 'friendly').slice(0, 20);
  const hit = strangers.map((b) => ({ b, d: BF.chat.think(b, 'can you add me?', { channel: 'dm' }) })).find((x) => x.d.after);
  assert.ok(hit, 'a friendly stranger agrees');
  hit.d.after();
  assert.ok(BF.friends.hasIncoming(hit.b.id));
});

test('test_chat_responders_prefer_the_mentioned_bot', () => {
  const { BF } = bootDefault();
  const pool = BF.bots.list.slice(0, 6);
  const target = pool[3];
  const r = BF.chat.responders(pool, 'hey ' + target.username + ' what level are you?');
  assert.equal(r.list.map((b) => b.id).join(','), target.id);
  assert.equal(r.mentioned, true);
});

test('test_chat_reply_uses_local_text_when_claude_is_unavailable', async () => {
  const { BF } = bootDefault();
  assert.equal(BF.ai.status(), 'off');
  assert.equal(BF.ai.available(), false);
  const r = await BF.chat.reply(friendBot(BF), 'what is 6 * 7', { channel: 'dm' });
  assert.match(r.text, /42/);
});

test('test_chat_normalize_expands_slang', () => {
  const { BF } = bootDefault();
  assert.equal(BF.chat.normalize('hru, wanna play?? ur cool'), 'how are you want to play your cool');
  assert.equal(BF.chat.evalMath('2^3+(4-1)*2'), 14);
  assert.equal(BF.chat.evalMath('alert(1)'), null);
});

test('test_chat_safety_replies_keep_their_local_wording_even_with_claude', async () => {
  const { BF } = bootDefault();
  let asked = 0;
  BF.ai.available = () => true;
  BF.ai.word = async () => { asked++; return 'CLAUDE WORDING'; };
  const safe = await BF.chat.reply(BF.bots.get('bot_glitchgoblin'), 'my phone number is 555 0101', { channel: 'dm' });
  assert.equal(asked, 0);
  assert.ok(!/CLAUDE WORDING|555/.test(safe.text));
  const normal = await BF.chat.reply(friendBot(BF), 'what games do you like?', { channel: 'dm' });
  assert.equal(asked, 1);
  assert.equal(normal.text.toLowerCase(), 'claude wording', 'Claude wording is kept (only the voice case applies)');
});

// ------------------------------------------------------------ in character (BLOCKFORGE-016)

test('test_chat_bots_insist_they_are_real_players', () => {
  const { BF } = bootDefault();
  for (const bot of BF.bots.list.slice(0, 40)) {
    for (const q of ['are you a bot?', 'r u real', 'are you an ai', 'is this an npc']) {
      const r = BF.chat.think(bot, q, { channel: 'dm' });
      assert.equal(r.intent, 'identity');
      assert.doesNotMatch(r.plain, /\b(i am|im|i'm) (a |an )?(bot|ai|npc|robot)\b|beep|boop/i, bot.displayName + ': ' + r.plain);
      assert.doesNotMatch(r.goal, /honestly that you are a/i);
    }
  }
});

test('test_chat_rich_players_know_where_their_money_comes_from', () => {
  const { BF } = bootDefault();
  const richest = BF.bots.get(BF.leaderboards.global('coins').rows[0].id);
  const w = BF.chat.wealth(richest);
  assert.equal(w.kind, 'owner');
  assert.equal(w.rich, true);
  const r = BF.chat.think(richest, 'how are you so rich', { channel: 'dm' });
  assert.equal(r.intent, 'wealth');
  assert.ok(r.plain.toLowerCase().includes(w.game.toLowerCase()) || r.plain.toLowerCase().includes(w.studio.toLowerCase()), r.plain);
  const ask = BF.chat.think(richest, 'can you give me some coins', { channel: 'dm' });
  assert.equal(ask.intent, 'ask_gift');
  assert.doesNotMatch(ask.plain, /no coins|barely have|broke|40 coins/i);
});

test('test_chat_claude_brief_keeps_character_and_knows_money_and_gifts', () => {
  const { BF } = bootDefault();
  const richest = BF.bots.get(BF.leaderboards.global('coins').rows[0].id);
  const d = BF.chat.think(richest, 'are you a bot', { channel: 'dm' });
  const brief = BF.ai.brief(richest, d, { channel: 'dm' });
  assert.doesNotMatch(brief, /say honestly that you are a BlockForge bot/i);
  assert.doesNotMatch(brief, /never promise to give coins/i);
  assert.match(brief, /real person/);
  assert.match(brief, /Gifting ForgeCoins between players is a real feature/);
  assert.match(brief, /You own the studio/);
});
