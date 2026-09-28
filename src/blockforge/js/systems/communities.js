/**
 * BlockForge — communities: every studio has one, with a feed of posts,
 * comments and likes, members you can join, and giveaways.
 *
 *   BF.communities.list()              every community (yours first once you have a studio)
 *   BF.communities.get(id)             one community
 *   BF.communities.feed(id)            its posts, newest first
 *   BF.communities.join(id) / leave(id) / joined(id)
 *   BF.communities.post(text)          post in your studio's community
 *   BF.communities.comment(postId, text) / like(postId)
 *   BF.communities.host({prize, winners, minutes})   run a giveaway in your community
 *   BF.communities.enter(giveawayId)   enter a studio's giveaway (free)
 *   BF.communities.tick(now)           studios post, giveaways run and end (world tick)
 *
 * Studios post updates, events, teasers and milestones on their own; people
 * like and comment in their own voices. Your posts get comments and likes
 * from your members. Giveaways you host take the prize from your wallet now,
 * draw entrants (who join your community, follow you and play your games)
 * and pay the winners at the end. Studio giveaways are free to enter, and
 * your chance is the number of winners over the number of entrants.
 * Everything is fictional and local (ADR-0004).
 * Story: BLOCKFORGE-020
 */
(function (BF) {
  'use strict';

  const U = BF.util;

  /** Tuning (data). */
  const T = {
    postEveryMin: [2, 6], // somewhere a studio posts
    giveawayEveryMin: [8, 20], // somewhere a studio starts a giveaway
    maxPosts: 25,
    maxComments: 14,
    postLen: [3, 400],
    host: { minPrize: 100, maxPrize: 100000000, winners: [1, 50], minutes: [2, 60] },
    entrantsPerMin: 0.8, // × prize^0.55, plus members / 40 a minute
    joinShare: 0.6, // entrants who join your community
    fanShare: 0.35, // entrants who follow you
    hypeMax: 3,
    botPrize: [5000, 25000, 50000, 100000, 250000, 500000, 1000000],
    botEntrants: [800, 6000],
  };

  const POSTS = {
    update: ['{game} v{v} is out now! {note}', 'Patch notes for {game}: {note}. Thanks for playing!', 'Big update just dropped in {game}. {note}'],
    event: ['This weekend in {game}: {mode}. Double rewards all weekend!', '{mode} event starts in {game} tonight. Bring your friends!', 'Community event! Beat our devs in {game} for a special badge'],
    teaser: ['Something big is coming to {game}... 👀', 'Sneak peek: we are working on {place}. Guesses?', 'Our team has been cooking. New game coming soon'],
    milestone: ['{game} just hit {n} visits! Thank you all!!', 'We reached {m} players online at once. You are amazing', '{n} favorites on {game}. We did not expect this'],
    poll: ['What should we add next to {game}: {a} or {b}?', 'Poll: {a} or {b}? Reply below!'],
  };
  const FILL = {
    note: ['New maps and a fresh leaderboard', 'Faster servers and bug fixes', 'New pets and a secret area', 'New weapons and balance changes', 'A new game mode and daily quests', 'New skins in the store'],
    mode: ['Double Coins Weekend', 'Boss Raid', 'Team Battle', 'Speedrun Rush', 'Treasure Hunt'],
    place: ['a lava world', 'an underwater level', 'a space station', 'a haunted castle', 'a candy land'],
    a: ['pets', 'a new map', 'trading', 'a boss fight', 'new skins'], b: ['vehicles', 'a ranked mode', 'guilds', 'a story mode', 'minigames'],
  };
  const COMMENTS = {
    any: ['W', 'lets gooo', 'finally!!', 'cant wait', 'hype', 'this studio never misses', 'first', 'omg yes', 'W studio', 'best devs on blockforge', 'when is the next update tho', 'love this'],
    giveaway: ['entered!! pls pick me', 'good luck everyone', 'W giveaway', 'im never lucky but lets see', 'pick me pls i have 12 coins lol', 'omg this is so generous'],
    poll: ['{a}!!!', '{b} for sure', 'both lol', '{a} 100%'],
    yours: ['W post', 'ur the best', 'cant wait!!', 'lets goooo', 'hype!!', 'i love ur games', 'u never miss', 'when is it coming out', 'W creator', 'first!!', 'this is gonna be huge'],
    question: ['yes!!', 'hmm good question', 'i think yes', 'depends lol', 'definitely'],
  };

  function st() { return BF.store.state && BF.store.state.community; }
  const slug = (name) => 'st-' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const rngFor = (k) => U.rng('com:' + k);
  function fill(line, x, rng) {
    return line.replace(/\{(\w+)\}/g, (m, k) => (x[k] != null ? String(x[k]) : FILL[k] ? U.pick(FILL[k], rng) : m));
  }
  function studioOf(id) {
    return BF.creatorEconomy.studios().find((x) => slug(x.name) === id) || null;
  }
  function vars(studio, rng) {
    const g = studio.games.length ? U.pick(studio.games, rng) : null;
    return { game: g ? g.name : studio.name, v: '1.' + (3 + Math.floor(rng() * 20)), n: U.compact(g ? BF.catalog.stats(g.id).visits : 1e6), m: U.compact(Math.max(1000, studio.playing)) };
  }
  function makePost(cid, kind, studio, now, rng) {
    const x = vars(studio, rng);
    const a = U.pick(FILL.a, rng), b = U.pick(FILL.b, rng);
    const text = fill(U.pick(POSTS[kind], rng), Object.assign(x, { a, b }), rng);
    return { id: U.uid('post'), cid, author: studio.owner.id, kind, text, ts: now, likes: Math.round((200 + rng() * 800) * Math.max(1, Math.sqrt(studio.playing / 1000))), liked: false, comments: [], poll: kind === 'poll' ? { a, b } : null };
  }
  function addComments(post, n, pool, rng, now) {
    for (let i = 0; i < n; i++) {
      const bot = U.pick(BF.bots.list, rng);
      const line = fill(U.pick(pool, rng), post.poll || {}, rng);
      post.comments.push({ botId: bot.id, text: BF.voice ? BF.voice.say(bot, line, { rng }) : line, ts: now - Math.floor(rng() * 600000) });
    }
    if (post.comments.length > T.maxComments) post.comments.splice(0, post.comments.length - T.maxComments);
  }
  function push(cid, post) {
    BF.store.update('community', (s) => {
      const list = s.community.posts[cid] || (s.community.posts[cid] = []);
      list.unshift(post);
      if (list.length > T.maxPosts) list.length = T.maxPosts;
    });
  }

  const com = (BF.communities = {
    T,
    slug,

    /** Every community: your studio's (if you have one) and one per studio. */
    list() {
      const s = BF.store.state;
      const out = [];
      if (s.company) out.push(com.get('mine'));
      for (const x of BF.creatorEconomy.studios()) out.push(com.get(slug(x.name), x));
      return out.filter(Boolean);
    },

    /** One community: {id, name, owner, members, color, mine, studio, games, active giveaway}. */
    get(id, studio) {
      const s = BF.store.state;
      if (id === 'mine') {
        if (!s.company) return null;
        const c = s.company;
        return { id, name: c.name, mine: true, owner: null, color: c.color, tagline: c.tagline, members: Math.round(s.community.members || 0), games: (s.created || []).filter((g) => g.published).map((g) => BF.catalog.get(g.id)).filter(Boolean), giveaway: com.activeGiveaway(id) };
      }
      const x = studio || studioOf(id);
      if (!x) return null;
      const members = Math.round(x.playing * 1.5 + x.visits / 20000);
      return { id, name: x.name, mine: false, owned: !!x.mine, owner: x.owner, color: null, tagline: '', members, games: x.games, studio: x, giveaway: com.activeGiveaway(id) };
    },

    joined(id) { const c = st(); return !!c && (id === 'mine' || c.joined.includes(id)); },
    join(id) { if (!com.joined(id)) BF.store.update('community', (s) => { s.community.joined.push(id); }); return { ok: true }; },
    leave(id) { BF.store.update('community', (s) => { s.community.joined = s.community.joined.filter((x) => x !== id); }); return { ok: true }; },

    /** Posts in a community, newest first. A studio's first visit seeds a few older posts. */
    feed(id) {
      const c = st();
      if (!c) return [];
      if (!c.posts[id] && id !== 'mine') {
        const x = studioOf(id);
        if (x) {
          const rng = rngFor(id), now = BF.clock.now();
          const seeded = ['update', 'milestone', 'event', 'teaser', 'poll'].map((k, i) => { const p = makePost(id, k, x, now - (i + 1) * (3 + rng() * 20) * 3600000, rng); addComments(p, 2 + Math.floor(rng() * 5), k === 'poll' ? COMMENTS.poll : COMMENTS.any, rng, p.ts + 600000); return p; });
          BF.store.update('community', (s) => { s.community.posts[id] = seeded; });
        }
      }
      return (c.posts[id] || []).slice();
    },

    /** Find a post anywhere. */
    findPost(postId) {
      const c = st();
      for (const id in c.posts) { const p = c.posts[id].find((x) => x.id === postId); if (p) return p; }
      return null;
    },

    /** Post in your studio's community. Members like and comment over the next minutes. */
    post(text) {
      const s = BF.store.state;
      if (!s.company) return { ok: false, error: 'Found your studio first.' };
      text = BF.dialogue.filter(String(text || '').trim());
      if (text.length < T.postLen[0] || text.length > T.postLen[1]) return { ok: false, error: 'Posts are ' + T.postLen[0] + '-' + T.postLen[1] + ' characters.' };
      const p = { id: U.uid('post'), cid: 'mine', author: 'me', kind: 'text', text, ts: BF.clock.now(), likes: 0, liked: false, comments: [] };
      push('mine', p);
      const members = s.community.members || 0;
      const n = U.clamp(Math.round(2 + Math.log10(1 + members) * 2), 2, 10);
      const pool = /\?/.test(text) ? COMMENTS.question.concat(COMMENTS.yours) : COMMENTS.yours;
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          const live = com.findPost(p.id);
          if (!live) return;
          const bot = U.pick(BF.bots.list);
          BF.store.update('community', () => {
            live.comments.push({ botId: bot.id, text: BF.voice ? BF.voice.say(bot, U.pick(pool)) : U.pick(pool), ts: BF.clock.now() });
            if (live.comments.length > T.maxComments) live.comments.splice(0, live.comments.length - T.maxComments);
            live.likes += Math.round(1 + members * (0.002 + Math.random() * 0.01));
          });
        }, 1500 + i * (1200 + Math.random() * 3000));
      }
      BF.bus.emit('community:post', { post: p });
      return { ok: true, post: p };
    },

    /** Comment on any post; someone may answer you. */
    comment(postId, text) {
      const p = com.findPost(postId);
      text = BF.dialogue.filter(String(text || '').trim()).slice(0, 200);
      if (!p || !text) return { ok: false, error: 'Write something first.' };
      BF.store.update('community', () => { p.comments.push({ botId: 'me', text, ts: BF.clock.now() }); if (p.comments.length > T.maxComments) p.comments.shift(); });
      if (Math.random() < 0.6) setTimeout(() => {
        const live = com.findPost(postId);
        if (!live) return;
        const bot = p.author !== 'me' && Math.random() < 0.4 ? BF.bots.get(p.author) : U.pick(BF.bots.list);
        const line = U.pick(['fr', 'agreed', 'real', 'haha same', 'W comment', 'true', 'lol yes']);
        BF.store.update('community', () => { live.comments.push({ botId: bot.id, text: BF.voice ? BF.voice.say(bot, line) : line, ts: BF.clock.now() }); });
      }, 2500 + Math.random() * 4000);
      return { ok: true };
    },

    like(postId) {
      const p = com.findPost(postId);
      if (!p) return { ok: false };
      BF.store.update('community', () => { p.liked = !p.liked; p.likes += p.liked ? 1 : -1; });
      return { ok: true, liked: p.liked };
    },

    // -------------------------------------------------------------- giveaways

    activeGiveaway(cid) {
      const c = st();
      return c ? c.giveaways.find((g) => g.cid === cid && !g.done) || null : null;
    },
    giveaway(id) { const c = st(); return c ? c.giveaways.find((g) => g.id === id) || null : null; },

    /**
     * Host a giveaway in your community. The prize leaves your wallet now.
     * @param {{prize:number, winners:number, minutes:number}} o
     */
    host(o) {
      const s = BF.store.state;
      const H = T.host;
      if (!s.company) return { ok: false, error: 'Found your studio first.' };
      if (com.activeGiveaway('mine')) return { ok: false, error: 'You already have a giveaway running.' };
      const prize = Math.floor(Number(o.prize)), winners = Math.floor(Number(o.winners)), minutes = Math.floor(Number(o.minutes));
      if (!(prize >= H.minPrize && prize <= H.maxPrize)) return { ok: false, error: 'Prizes are ' + U.fmt(H.minPrize) + ' to ' + U.fmt(H.maxPrize) + ' ForgeCoins.' };
      if (!(winners >= H.winners[0] && winners <= H.winners[1])) return { ok: false, error: 'Pick ' + H.winners[0] + ' to ' + H.winners[1] + ' winners.' };
      if (!(minutes >= H.minutes[0] && minutes <= H.minutes[1])) return { ok: false, error: 'Giveaways last ' + H.minutes[0] + ' to ' + H.minutes[1] + ' minutes.' };
      if (winners > prize) return { ok: false, error: 'Each winner needs at least 1 ForgeCoin.' };
      const paid = BF.economy.spend(prize, 'Giveaway in ' + s.company.name, 'giveaway');
      if (!paid.ok) return { ok: false, error: 'You need ' + U.fmt(prize) + ' ForgeCoins for this prize.' };
      const now = BF.clock.now();
      const g = { id: U.uid('gw'), cid: 'mine', host: 'me', prize, winners, start: now, end: now + minutes * 60000, entrants: 0, entered: true, done: false, tickAt: now };
      const post = { id: U.uid('post'), cid: 'mine', author: 'me', kind: 'giveaway', text: 'GIVEAWAY! ' + U.fmt(prize) + ' ForgeCoins for ' + winners + ' winner' + (winners > 1 ? 's' : '') + '. Join the community to enter, ends in ' + minutes + ' minutes!', ts: now, likes: 0, liked: false, comments: [], giveaway: g.id };
      BF.store.update('community', (x) => { x.community.giveaways.unshift(g); if (x.community.giveaways.length > 30) x.community.giveaways.length = 30; });
      push('mine', post);
      // the buzz reaches your games
      const hype = Math.min(T.hypeMax, 1.3 + Math.log10(prize) / 6);
      BF.store.update('created', (x) => { for (const ug of x.created) if (ug.published) ug.hype = { until: g.end + 15 * 60000, mult: Math.max(hype, (ug.hype && ug.hype.until > now && ug.hype.mult) || 1) }; });
      BF.bus.emit('community:giveaway', { giveaway: g });
      return { ok: true, giveaway: g };
    },

    /** Enter a studio's giveaway (free; you join the community too). */
    enter(id) {
      const g = com.giveaway(id);
      if (!g || g.done) return { ok: false, error: 'This giveaway has ended.' };
      if (g.host === 'me') return { ok: false, error: 'You cannot enter your own giveaway.' };
      if (g.entered) return { ok: false, error: 'You already entered.' };
      com.join(g.cid);
      BF.store.update('community', () => { g.entered = true; g.entrants += 1; });
      return { ok: true, chance: g.winners / Math.max(1, g.entrants) };
    },

    /** A studio starts a giveaway. */
    startStudioGiveaway(now, rng, studio) {
      rng = rng || Math.random;
      const list = BF.creatorEconomy.studios().filter((x) => !x.mine);
      const x = studio || list[Math.floor(Math.pow(rng(), 1.6) * list.length)];
      if (!x || com.activeGiveaway(slug(x.name))) return null;
      const rich = x.lifetime > 1e9 ? 3 : x.lifetime > 3e8 ? 2 : 0;
      const prize = T.botPrize[Math.min(T.botPrize.length - 1, Math.floor(rng() * 4) + rich)];
      const winners = [1, 1, 2, 3, 5, 10][Math.floor(rng() * 6)];
      const minutes = 4 + Math.floor(rng() * 12);
      const cid = slug(x.name);
      const g = { id: U.uid('gw'), cid, host: x.owner.id, prize, winners, start: now, end: now + minutes * 60000, entrants: Math.floor(T.botEntrants[0] * rng()), target: T.botEntrants[0] + Math.floor(rng() * (T.botEntrants[1] - T.botEntrants[0])), entered: false, done: false, tickAt: now };
      com.feed(cid);
      const post = { id: U.uid('post'), cid, author: x.owner.id, kind: 'giveaway', text: 'GIVEAWAY TIME! ' + U.fmt(prize) + ' ForgeCoins for ' + winners + ' lucky member' + (winners > 1 ? 's' : '') + '. Ends in ' + minutes + ' min. Good luck!', ts: now, likes: Math.round(300 + rng() * 3000), liked: false, comments: [], giveaway: g.id };
      addComments(post, 3, COMMENTS.giveaway, rng, now);
      BF.store.update('community', (s) => { s.community.giveaways.unshift(g); if (s.community.giveaways.length > 30) s.community.giveaways.length = 30; });
      push(cid, post);
      const c = st();
      if (BF.notify && c.joined.includes(cid)) BF.notify.push({ type: 'update', title: x.name + ' started a giveaway', body: U.fmt(prize) + ' ForgeCoins for ' + winners + ' winner' + (winners > 1 ? 's' : '') + '. Enter before it ends!', icon: 'gift', route: '#/community/' + cid });
      return g;
    },

    /** Finish a giveaway: draw winners, pay them, post the results. */
    finish(g, rng) {
      rng = rng || Math.random;
      const s = BF.store.state;
      const each = Math.floor(g.prize / g.winners);
      let youWon = false;
      const names = [];
      if (g.host !== 'me' && g.entered && rng() < g.winners / Math.max(1, g.entrants)) youWon = true;
      const botWinners = U.shuffle(BF.bots.list.filter((b) => b.id !== g.host), rng).slice(0, g.winners - (youWon ? 1 : 0));
      BF.store.update(['community', 'bots'], (x) => {
        g.done = true;
        g.winnerIds = botWinners.map((b) => b.id).concat(youWon ? ['me'] : []);
        for (const b of botWinners) { const r = x.bots[b.id] || (x.bots[b.id] = {}); r.coins = (r.coins || 0) + each; names.push(b.displayName); }
      });
      if (youWon) {
        names.unshift(s.player.displayName);
        BF.economy.earn(each, 'Won a giveaway in ' + (com.get(g.cid) || {}).name, 'giveaway');
        if (BF.notify) BF.notify.push({ type: 'gift', title: 'You won ' + U.fmt(each) + ' ForgeCoins!', body: 'You were drawn in the ' + (com.get(g.cid) || {}).name + ' giveaway (' + U.fmt(g.entrants) + ' entrants).', icon: 'gift', route: '#/community/' + g.cid });
      }
      const text = 'Giveaway over! ' + U.fmt(g.entrants) + ' entered. Congrats to ' + names.slice(0, 5).join(', ') + (names.length > 5 ? ' and ' + (names.length - 5) + ' more' : '') + '! ' + U.fmt(each) + ' ForgeCoins each.';
      const post = { id: U.uid('post'), cid: g.cid, author: g.host, kind: 'giveaway', text, ts: BF.clock.now(), likes: Math.round(g.entrants * 0.2), liked: false, comments: [] };
      addComments(post, 3, ['congrats!!', 'gg to the winners', 'next time for sure', 'W giveaway', 'i never win lol'], rng, BF.clock.now());
      push(g.cid, post);
      if (g.host === 'me' && botWinners[0] && BF.messages && BF.voice) setTimeout(() => { if (BF.store.state) BF.messages.receive(botWinners[0].id, BF.voice.say(botWinners[0], U.pick(['OMG I WON UR GIVEAWAY THANK U', 'i never win anything!! thank u so much', 'THANK UUU best creator ever'])), { quietIfOpen: true }); }, 2000);
      return { youWon, each, names };
    },

    /** World tick: studios post and run giveaways; giveaways grow and end. */
    tick(now, rng) {
      const c = st();
      if (!c || !BF.creatorEconomy) return;
      rng = rng || Math.random;
      now = now || BF.clock.now();
      if (!c.nextPostAt) c.nextPostAt = now + 60000;
      if (!c.nextGiveawayAt) c.nextGiveawayAt = now + 3 * 60000;
      if (now >= c.nextPostAt) {
        c.nextPostAt = now + (T.postEveryMin[0] + rng() * (T.postEveryMin[1] - T.postEveryMin[0])) * 60000;
        const pool = BF.creatorEconomy.studios();
        const prefer = pool.filter((x) => c.joined.includes(slug(x.name)));
        const x = prefer.length && rng() < 0.6 ? U.pick(prefer, rng) : U.pick(pool, rng);
        if (x) {
          const cid = slug(x.name);
          com.feed(cid);
          const kind = U.pick(['update', 'event', 'teaser', 'milestone', 'poll'], rng);
          const p = makePost(cid, kind, x, now, rng);
          addComments(p, 1 + Math.floor(rng() * 4), kind === 'poll' ? COMMENTS.poll : COMMENTS.any, rng, now);
          push(cid, p);
          if (BF.notify && c.joined.includes(cid) && (kind === 'update' || kind === 'event')) BF.notify.push({ type: 'update', title: x.name + ' posted', body: p.text, icon: 'flag', route: '#/community/' + cid, silent: true });
        }
      }
      if (now >= c.nextGiveawayAt) {
        c.nextGiveawayAt = now + (T.giveawayEveryMin[0] + rng() * (T.giveawayEveryMin[1] - T.giveawayEveryMin[0])) * 60000;
        com.startStudioGiveaway(now, rng);
      }
      for (const g of c.giveaways) {
        if (g.done) continue;
        const dt = U.clamp((now - (g.tickAt || now)) / 60000, 0, 10);
        g.tickAt = now;
        if (g.host === 'me') {
          const grow = (T.entrantsPerMin * Math.pow(g.prize, 0.55) + (c.members || 0) / 40) * dt;
          const n = Math.floor(grow) + (rng() < grow % 1 ? 1 : 0);
          g.entrants += n;
          c.members = (c.members || 0) + n * T.joinShare;
          if (BF.followers && n) BF.followers.addFans(Math.round(n * T.fanShare));
        } else {
          g.entrants = Math.min(g.target, Math.round(g.entrants + (g.target / Math.max(1, (g.end - g.start) / 60000)) * dt * (0.7 + rng() * 0.6)));
        }
        if (now >= g.end) com.finish(g, rng);
      }
      BF.store.touch('communityStats');
    },

    worldTick() { com.tick(BF.clock.now()); },
  });
})((window.BF = window.BF || {}));
