/**
 * BlockForge — real multiplayer between the people who open this BlockForge (ADR-0017).
 *
 * Everything else on BlockForge is a local simulation: bots, servers and the
 * economy live in each player's own save. This module connects real people
 * through the artifact platform's runtime capabilities, when the page runs
 * inside claude.ai and the viewer's access allows it:
 *
 *   user   an opaque, stable id per person (no names or emails are asked for:
 *          players are known by their in-game username only)
 *   db     the shared player directory: one document per person, `p/<id>`,
 *          holding their public profile and their OUTBOX: what they have sent
 *          to each other player (friend requests, messages, gifts, invites).
 *          Each person writes only their own document (access rule p/{self}).
 *   room   live presence: who is here right now, what they are playing, where
 *          their character is (so friends in the same server see each other)
 *          and the same outbox, trimmed, so view-only players can still send
 *          friend requests and messages while both are online.
 *
 * Receiving is reading: you pick up what others addressed to you from their
 * documents and presence, and keep it in your own save (state.net). Nothing
 * here is private from other people with access to this BlockForge, and all
 * of it is optional: without the platform (a saved copy, a public-link
 * visitor, unit tests) BF.net stays 'off' and BlockForge plays exactly as
 * before. ForgeCoin gifts between players are fictional currency.
 *
 *   BF.net.connect([claude])   start (main.js calls it after sign-in)
 *   BF.net.state()             {state, me, canWrite, db, room}
 *   BF.net.person(key)         a real player as a bot-like display object
 *   BF.net.relation(key)       'friends' | 'incoming' | 'outgoing' | 'none' | 'blocked'
 *   BF.net.request/accept/decline/cancel/unfriend/block/unblock(key)
 *   BF.net.send(key, text) / thread(key) / conversations() / gift(key, n) / invite(key)
 *   BF.net.gameState({g, sv, pos, sc}) / say(text) / playersIn(gameId, serverId)
 *
 * Real players are addressed in the UI by a key, 'rp-<hash>', never by their raw id.
 * Story: BLOCKFORGE-024
 */
(function (BF) {
  'use strict';

  const U = BF.util;

  /** Tuning (data). */
  const T = {
    v: 1, // document and presence schema version; readers accept any, writers send this
    coll: 'p', // collection of player documents, one per person: p/<id>
    docLimit: 500,
    maxText: 300, // characters per message
    maxMsgs: 30, // messages kept per recipient in an outbox
    maxGifts: 20,
    maxClaimed: 60,
    maxGift: 1000000, // largest single gift between players
    maxThread: 200, // messages kept per conversation in your save
    maxPeople: 300, // real players remembered in your save
    maxBio: 200,
    presence: { msgs: 3, gifts: 3, windowMs: 20 * 60000, budget: 3400, posMs: 120 },
    inviteMs: 15 * 60000, // invites older than this are not announced
    writeMs: 700, // coalesce outbox writes
    profileMs: 2500, // coalesce profile writes
    liveMs: 1200, // at most one 'netLive' page refresh this often
    useTimeoutMs: 12000,
  };

  const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
  const ID_RE = /^[A-Za-z0-9_.:-]{1,48}$/;
  const FAME_IDS = ['newcomer', 'rising', 'known', 'popular', 'famous', 'superstar', 'legend'];

  // ---------------------------------------------------------------- runtime state

  let db = null, room = null, user = null;
  let me = null; // this person's id
  let phase = 'off'; // off | connecting | online | unavailable
  let canWrite = null; // may write their own player document (null: not told yet)
  let roomUp = false;
  let unsubs = [];
  const docs = new Map(); // uid -> sanitized document
  const peers = new Map(); // uid -> sanitized presence (+ peer, t)
  const keyToUid = new Map();
  let writeTimer = null, writing = false, dirty = false, lastWritten = '';
  let presTimer = null, lastPres = {}, posAt = 0;
  let gameNow = null; // {g, sv, pos, sc}
  let sayNow = null;
  let processQueued = false;
  let liveTimer = null, liveAt = 0;
  let sessionAt = 0;
  let lastLive = '';
  let recovered = false;
  let storeOff = null;

  // ---------------------------------------------------------------- helpers

  const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').slice(0, max);
  const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const now = () => Date.now();
  /** Two significant figures: follower counts move every few seconds, the published one need not. */
  const round2 = (n) => { if (n < 100) return n; const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; };

  function key(uid) {
    const k = 'rp-' + U.hash(uid).toString(36) + U.hash('x' + uid).toString(36).slice(0, 3);
    keyToUid.set(k, uid);
    return k;
  }
  /** A recipient's key inside presence: presence keys must be plain identifiers, ids may not be. */
  function tk(uid) {
    return 't' + U.hash(uid).toString(36) + U.hash('y' + uid).toString(36);
  }
  /** UTF-8 size of a JSON value (the platform counts bytes, not characters). */
  const bytes = (v) => unescape(encodeURIComponent(JSON.stringify(v))).length;

  function uidOf(k) {
    if (keyToUid.has(k)) return keyToUid.get(k);
    const s = BF.store.state;
    const p = s && s.net && s.net.people[k];
    if (p && p.uid) { keyToUid.set(k, p.uid); return p.uid; }
    return null;
  }

  function netState() {
    const s = BF.store.state;
    if (!s) return null;
    if (!s.net || typeof s.net !== 'object') s.net = defaults();
    return s.net;
  }

  /** The save slice (also used by store.js for new and migrated saves). */
  function defaults() {
    return { people: {}, out: {}, threads: {}, claimed: [], blocked: [], seen: { req: {}, inv: {}, fr: {} } };
  }

  // ------------------------------------------------------------ sanitizing (all input is untrusted)

  function avatarIn(av) {
    const eq = {};
    const ids = av && Array.isArray(av.e) ? av.e : av && av.equipped && typeof av.equipped === 'object' ? Object.values(av.equipped) : [];
    for (const id of ids.slice(0, 20)) {
      const it = typeof id === 'string' ? BF.ITEMS[id] : null;
      const slot = it && BF.ITEM_CATS[it.cat] && BF.ITEM_CATS[it.cat].slot;
      if (slot && !eq[slot]) eq[slot] = id;
    }
    for (const [slot, id] of Object.entries(BF.REQUIRED_SLOTS)) if (!eq[slot]) eq[slot] = id;
    const skin = av && typeof (av.s || av.skin) === 'string' && /^#[0-9a-f]{6}$/i.test(av.s || av.skin) ? (av.s || av.skin) : BF.STARTER_SKIN;
    const out = { skin, equipped: {} };
    for (const slot of BF.AVATAR_SLOTS) out.equipped[slot] = eq[slot] || null;
    return out;
  }

  function avatarOut(av) {
    return { s: av.skin, e: BF.AVATAR_SLOTS.map((k) => av.equipped[k]).filter(Boolean) };
  }

  function profileIn(p) {
    if (!p || typeof p !== 'object') return null;
    const username = typeof p.u === 'string' && NAME_RE.test(p.u) ? p.u : typeof p.username === 'string' && NAME_RE.test(p.username) ? p.username : null;
    if (!username) return null;
    return {
      username,
      displayName: clean(p.dn || p.displayName || username, 24) || username,
      bio: clean(p.bio, T.maxBio),
      level: Math.floor(num(p.lv != null ? p.lv : p.level, 1, 999, 1)),
      fame: FAME_IDS.includes(p.fame) ? p.fame : 'newcomer',
      followers: Math.floor(num(p.fl != null ? p.fl : p.followers, 0, 1e12, 0)),
      verified: p.vf === true || p.verified === true,
      gifts: ['everyone', 'friends', 'none'].includes(p.gp) ? p.gp : 'friends',
      joinDate: num(p.jd, 0, 4e12, 0),
      avatar: avatarIn(p.av || p.avatar),
    };
  }

  function msgsIn(list, max) {
    const out = [];
    if (!Array.isArray(list)) return out;
    for (const m of list.slice(-max)) {
      if (!m || typeof m.id !== 'string' || !ID_RE.test(m.id)) continue;
      const text = clean(m.t, T.maxText).trim();
      if (!text) continue;
      out.push({ id: m.id, t: text, at: num(m.at, 0, now() + 60000, 0) });
    }
    return out;
  }

  function giftsIn(list) {
    const out = [];
    if (!Array.isArray(list)) return out;
    for (const g of list.slice(-T.maxGifts)) {
      if (!g || typeof g.id !== 'string' || !ID_RE.test(g.id)) continue;
      const n = Math.floor(num(g.n, 0, T.maxGift, 0));
      if (n < 1) continue;
      out.push({ id: g.id, n, at: num(g.at, 0, now() + 60000, 0) });
    }
    return out;
  }

  /** What one player's outbox holds for one recipient. */
  function boxIn(b) {
    if (!b || typeof b !== 'object') return null;
    const inv = b.invite && typeof b.invite === 'object' && typeof b.invite.g === 'string' && BF.catalog.get(b.invite.g) ? { g: b.invite.g, sv: clean(b.invite.sv, 12), at: num(b.invite.at, 0, now() + 60000, 0) } : null;
    return {
      friend: b.friend === true,
      at: num(b.at, 0, now() + 60000, 0),
      declinedAt: num(b.declinedAt, 0, now() + 60000, 0),
      msgs: msgsIn(b.msgs, T.maxMsgs),
      gifts: giftsIn(b.gifts),
      claimed: Array.isArray(b.claimed) ? b.claimed.filter((x) => typeof x === 'string' && ID_RE.test(x)).slice(-T.maxClaimed) : [],
      got: num(b.got, 0, now() + 60000, 0), // the newest message of yours they have received
      invite: inv,
    };
  }

  function docIn(id, d) {
    if (!d || typeof d !== 'object' || d.uid !== id) return null; // a document must name its own owner
    const to = d.to && typeof d.to === 'object' && !Array.isArray(d.to) ? d.to : {};
    return {
      hidden: d.hidden === true,
      profile: d.hidden === true ? null : profileIn(d.profile),
      seenAt: num(d.seenAt, 0, now() + 60000, 0),
      box: me && to[me] ? boxIn(to[me]) : null, // only what is addressed to you is read
      mine: id === me ? to : null,
    };
  }

  function presenceIn(p) {
    if (!p || typeof p !== 'object') return null;
    const g = typeof p.g === 'string' && BF.catalog.get(p.g) ? p.g : null;
    const pos = Array.isArray(p.pos) && p.pos.length >= 4 && p.pos.slice(0, 5).every((x) => typeof x === 'number' && isFinite(x)) ? p.pos.slice(0, 5).map((x) => Math.max(-1e5, Math.min(1e5, x))) : null;
    const say = p.say && typeof p.say === 'object' && typeof p.say.id === 'string' && ID_RE.test(p.say.id) ? { id: p.say.id, t: clean(p.say.t, 120).trim(), at: num(p.say.at, 0, now() + 60000, 0) } : null;
    const to = p.to && typeof p.to === 'object' && me && p.to[tk(me)] ? boxIn(p.to[tk(me)]) : null;
    return {
      hidden: p.hidden === true,
      profile: p.hidden === true ? null : profileIn(p),
      state: g ? 'ingame' : 'online',
      g,
      sv: g ? clean(p.sv, 12) : null,
      pos: g ? pos : null,
      sc: num(p.sc, 1, 40, 8),
      say: say && say.t ? say : null,
      box: to,
    };
  }

  // ------------------------------------------------------------ what you publish

  function hidden() {
    const s = BF.store.state;
    return !!(s && s.settings.privacy.realPlayers === false);
  }

  function myProfile() {
    const s = BF.store.state;
    const p = s.player;
    const f = BF.fame ? BF.fame.me() : null;
    return {
      u: p.username,
      dn: p.displayName,
      bio: String(p.bio || '').slice(0, T.maxBio),
      lv: p.level,
      fame: f ? f.tier.id : 'newcomer',
      fl: round2(BF.followers ? BF.followers.total() : s.social.followers.length),
      vf: f ? f.level >= 2 : false,
      gp: s.settings.privacy.gifts || 'friends',
      jd: p.joinDate || 0,
      av: avatarOut(s.avatar),
    };
  }

  /** Your outbox, trimmed to what a document holds. */
  function outForDb() {
    const out = {};
    for (const [uid, b] of Object.entries(netState().out)) {
      if (!b) continue;
      out[uid] = { friend: !!b.friend, at: b.at || 0 };
      if (b.declinedAt) out[uid].declinedAt = b.declinedAt;
      if (b.msgs && b.msgs.length) out[uid].msgs = b.msgs.slice(-T.maxMsgs);
      if (b.gifts && b.gifts.length) out[uid].gifts = b.gifts.slice(-T.maxGifts);
      if (b.claimed && b.claimed.length) out[uid].claimed = b.claimed.slice(-T.maxClaimed);
      if (b.got) out[uid].got = b.got;
      if (b.invite) out[uid].invite = b.invite;
    }
    return out;
  }

  /** Your outbox, trimmed to recent items so it fits in presence (4 KiB in all). */
  function outForPresence(budget) {
    // what they have not received yet (they acknowledge messages with `got`, gifts with `claimed`);
    // with a writable document only recent items ride along, as the document carries the rest
    const since = canWrite === false ? 0 : now() - T.presence.windowMs;
    const out = {};
    for (const [uid, b] of Object.entries(netState().out)) {
      if (!b) continue;
      const ack = inbound(uid);
      const got = (ack && ack.got) || 0;
      const claimed = ack ? ack.claimed : [];
      const o = { friend: !!b.friend, at: b.at || 0 };
      if (b.declinedAt) o.declinedAt = b.declinedAt;
      if (b.got) o.got = b.got;
      const msgs = (b.msgs || []).filter((m) => m.at > since && m.at > got).slice(-T.presence.msgs);
      const gifts = (b.gifts || []).filter((g) => g.at > since && !claimed.includes(g.id)).slice(-T.presence.gifts);
      if (msgs.length) o.msgs = msgs;
      if (gifts.length) o.gifts = gifts;
      if (b.claimed && b.claimed.length) o.claimed = b.claimed.slice(-5);
      if (b.invite && b.invite.at > now() - T.inviteMs) o.invite = b.invite;
      if (o.friend || o.declinedAt || o.got || o.msgs || o.gifts || o.claimed || o.invite) out[tk(uid)] = o;
    }
    // over budget: drop the oldest messages first, then whole recipients
    let size = bytes(out);
    const order = Object.keys(out).sort((a, b) => (out[a].at || 0) - (out[b].at || 0));
    for (const uid of order) {
      if (size <= budget) break;
      if (out[uid].msgs) { delete out[uid].msgs; size = bytes(out); }
    }
    for (const uid of order) {
      if (size <= budget) break;
      delete out[uid];
      size = bytes(out);
    }
    return out;
  }

  function scheduleWrite(ms) {
    if (!db || !me || canWrite === false || phase !== 'online') return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(flushWrite, ms == null ? T.writeMs : ms);
  }

  async function flushWrite() {
    if (!db || !me || canWrite === false || !BF.store.state) return;
    if (writing) { dirty = true; return; }
    writing = true;
    try {
      const body = hidden() ? { v: T.v, uid: me, hidden: true, seenAt: sessionAt, to: outForDb() } : { v: T.v, uid: me, profile: myProfile(), seenAt: sessionAt, to: outForDb() };
      if (JSON.stringify(body).length > 240000) {
        for (const b of Object.values(body.to)) if (b.msgs) b.msgs = b.msgs.slice(-8);
      }
      const text = JSON.stringify(body);
      if (text !== lastWritten) {
        await db.doc(T.coll + '/' + me).set(body);
        lastWritten = text;
      }
      if (canWrite == null) { canWrite = true; touchLive(); }
    } catch (e) {
      // a refused write (view-only access) means presence is the only way out for this visit
      if (e && (e.code === 'invalid_argument' || e.name === 'TypeError')) { canWrite = false; touchLive(); }
    } finally {
      writing = false;
      if (dirty) { dirty = false; scheduleWrite(200); }
    }
  }

  function presenceBody() {
    const s = BF.store.state;
    if (!s || !me) return {};
    const base = hidden() ? { v: T.v, uid: me, hidden: true } : Object.assign({ v: T.v, uid: me }, myProfile());
    delete base.bio; // keep presence small; the bio lives in the document
    if (!hidden() && gameNow) {
      base.g = gameNow.g;
      base.sv = gameNow.sv;
      if (gameNow.pos) base.pos = gameNow.pos.map((x) => Math.round(x * 10) / 10);
      if (gameNow.sc) base.sc = gameNow.sc;
      if (sayNow) base.say = sayNow;
    }
    const used = bytes(base);
    base.to = outForPresence(Math.max(400, T.presence.budget - used));
    return base;
  }

  function schedulePresence(ms) {
    if (!room || !me || phase !== 'online') return;
    if (presTimer) return;
    presTimer = setTimeout(sendPresence, ms == null ? 0 : ms);
  }

  function sendPresence() {
    presTimer = null;
    if (!room || !me) return;
    const next = presenceBody();
    const patch = {};
    let changed = false;
    for (const k of Object.keys(next)) if (JSON.stringify(next[k]) !== JSON.stringify(lastPres[k])) { patch[k] = next[k]; changed = true; }
    for (const k of Object.keys(lastPres)) if (!(k in next)) { patch[k] = null; changed = true; }
    if (!changed) return;
    lastPres = next;
    room.presence(patch).catch((e) => {
      // refused (too big or malformed): the whole patch was dropped, so send it again without the outbox
      if (!e || e.code !== 'invalid_argument') return;
      const retry = Object.assign({}, patch, { to: {} });
      lastPres = Object.assign({}, next, { to: {} });
      room.presence(retry).catch(() => { lastPres = {}; });
    });
  }

  function publish(profileOnly) {
    scheduleWrite(profileOnly ? T.profileMs : T.writeMs);
    schedulePresence(0);
  }

  // ------------------------------------------------------------ what you receive

  function touchLive() {
    const t = now();
    if (t - liveAt >= T.liveMs) {
      liveAt = t;
      BF.store.touch('netLive');
      if (BF.shell && BF.shell.updateLive) try { BF.shell.updateLive(); } catch (e) { /* no shell in tests */ }
      return;
    }
    if (!liveTimer) liveTimer = setTimeout(() => { liveTimer = null; touchLive(); }, T.liveMs - (t - liveAt));
  }

  function queueProcess() {
    if (processQueued) return;
    processQueued = true;
    Promise.resolve().then(() => { processQueued = false; process(); });
  }

  function onDocs(snap) {
    docs.clear();
    for (const d of snap.docs) {
      if (!d.exists) continue;
      const data = d.data();
      const parsed = docIn(d.id, data);
      if (!parsed) continue;
      if (d.id === me) { recoverOutbox(parsed.mine); continue; }
      docs.set(d.id, parsed);
    }
    queueProcess();
  }

  /** A second device, or a cleared save: take back what your own document says you sent. */
  function recoverOutbox(to) {
    if (recovered || !to) return;
    recovered = true;
    const n = netState();
    let changed = false;
    for (const [uid, raw] of Object.entries(to)) {
      if (n.out[uid] || typeof uid !== 'string' || !ID_RE.test(uid)) continue;
      const b = boxIn(raw);
      if (!b) continue;
      n.out[uid] = { friend: b.friend, at: b.at, declinedAt: b.declinedAt || 0, msgs: b.msgs, gifts: b.gifts, claimed: b.claimed, got: b.got || 0, invite: b.invite };
      for (const id of b.claimed) if (!n.claimed.includes(id)) n.claimed.push(id);
      changed = true;
    }
    if (changed) BF.store.touch('net');
  }

  function onPeers(change) {
    let structural = false;
    const seenNow = new Set();
    for (const p of change.peers) {
      if (!p || p.kind !== 'viewer' || p.isMe) continue;
      const uid = typeof p.by === 'string' && p.by ? p.by : p.presence && typeof p.presence.uid === 'string' ? p.presence.uid : null;
      if (!uid || uid === me || !ID_RE.test(uid) || seenNow.has(uid)) continue;
      const parsed = presenceIn(p.presence);
      if (!parsed) continue;
      seenNow.add(uid);
      const prev = peers.get(uid);
      const sig = JSON.stringify([parsed.profile, parsed.state, parsed.g, parsed.sv, parsed.box, parsed.hidden]);
      parsed.sig = sig;
      parsed.t = now();
      parsed.peer = p.peer;
      if (!prev || prev.sig !== sig) structural = true;
      peers.set(uid, parsed);
    }
    for (const uid of Array.from(peers.keys())) if (!seenNow.has(uid)) { peers.delete(uid); structural = true; }
    if (structural) queueProcess();
  }

  /** What a player has sent you: their document's outbox merged with their presence's. */
  function inbound(uid) {
    const a = docs.get(uid), b = peers.get(uid);
    const x = a && a.box, y = b && b.box;
    if (!x && !y) return null;
    if (!x || !y) return x || y;
    const latest = (y.at || 0) >= (x.at || 0) ? y : x;
    const union = (l1, l2) => { const m = new Map(); for (const i of l1.concat(l2)) m.set(i.id, i); return Array.from(m.values()).sort((p, q) => p.at - q.at); };
    return {
      friend: latest.friend,
      at: latest.at,
      declinedAt: Math.max(x.declinedAt || 0, y.declinedAt || 0),
      msgs: union(x.msgs, y.msgs),
      gifts: union(x.gifts, y.gifts),
      claimed: Array.from(new Set(x.claimed.concat(y.claimed))),
      got: Math.max(x.got || 0, y.got || 0),
      invite: !x.invite ? y.invite : !y.invite ? x.invite : x.invite.at >= y.invite.at ? x.invite : y.invite,
    };
  }

  function profileFor(uid) {
    const p = peers.get(uid), d = docs.get(uid);
    return (p && p.profile) || (d && d.profile) || null;
  }

  function process() {
    const s = BF.store.state;
    if (!s || !me) return;
    const n = netState();
    const uids = new Set([...docs.keys(), ...peers.keys()]);
    let changed = false;
    const notes = [];
    for (const uid of uids) {
      const k = key(uid);
      // remember who they are, so friends and conversations survive going offline
      const prof = profileFor(uid);
      const hiddenNow = (peers.get(uid) || docs.get(uid) || {}).hidden;
      if (prof && !hiddenNow) {
        const d = docs.get(uid);
        const rec = Object.assign({ uid }, prof, { seen: Math.max(peers.has(uid) ? now() : 0, (d && d.seenAt) || 0, (n.people[k] && n.people[k].seen) || 0) });
        const old = n.people[k];
        if (!old || JSON.stringify(Object.assign({}, old, { seen: 0 })) !== JSON.stringify(Object.assign({}, rec, { seen: 0 })) || rec.seen - (old.seen || 0) > 600000) { n.people[k] = rec; changed = true; }
      }
      if (n.blocked.includes(uid)) continue;
      const inb = inbound(uid);
      if (!inb) continue;
      const who = n.people[k] || { displayName: 'A player', username: 'player' };
      const rel = relationOf(uid, inb);
      // friend requests and new friendships, announced once each
      if (rel === 'incoming' && n.seen.req[uid] !== inb.at) {
        n.seen.req[uid] = inb.at;
        changed = true;
        if (s.settings.privacy.friendRequests !== 'none') notes.push({ type: 'friend', title: 'Friend request from a real player', body: who.displayName + ' (@' + who.username + ') wants to be your friend.', icon: 'userPlus', route: '#/user/' + k });
      }
      if (rel === 'friends' && !n.seen.fr[uid]) {
        n.seen.fr[uid] = true;
        changed = true;
        notes.push({ type: 'friend', title: 'You and ' + who.displayName + ' are now friends', body: 'Real player · say hi or join their game.', icon: 'userCheck', route: '#/messages/' + k });
      } else if (rel !== 'friends' && n.seen.fr[uid]) { delete n.seen.fr[uid]; changed = true; }
      // messages
      const th = n.threads[uid] || (n.threads[uid] = { msgs: [], updated: 0 });
      const known = new Set(th.msgs.map((m) => m.id));
      const pm = s.settings.privacy.messages;
      const allowMsg = pm !== 'none' && (pm !== 'friends' || rel === 'friends');
      let fresh = 0, last = null;
      for (const m of inb.msgs) {
        if (known.has(m.id) || !allowMsg) continue;
        const openNow = BF.ui && BF.ui.currentConversation === k;
        const text = s.settings.gameplay.chatFilter !== false && BF.dialogue ? BF.dialogue.filter(m.t) : m.t;
        th.msgs.push({ id: m.id, from: 'them', text, ts: Math.min(m.at || now(), now()), read: !!openNow });
        th.updated = Math.max(th.updated, Math.min(m.at || now(), now()));
        fresh++;
        last = text;
        changed = true;
      }
      const newest = inb.msgs.reduce((m, x) => Math.max(m, x.at || 0), 0);
      if (allowMsg && newest > ((n.out[uid] && n.out[uid].got) || 0)) {
        const ob = n.out[uid] || (n.out[uid] = { friend: false, at: 0, msgs: [], gifts: [], claimed: [] });
        ob.got = newest; // lets them stop resending (presence) what you already have
        changed = true;
        scheduleWrite();
        schedulePresence(0);
      }
      if (fresh) {
        th.msgs.sort((a, b) => a.ts - b.ts);
        if (th.msgs.length > T.maxThread) th.msgs.splice(0, th.msgs.length - T.maxThread);
        if (!(BF.ui && BF.ui.currentConversation === k)) notes.push({ type: 'bot', title: 'New message from ' + who.displayName, body: (fresh > 1 ? fresh + ' messages · ' : '') + last, icon: 'chat', route: '#/messages/' + k });
        BF.bus.emit('messages:received', { with: k });
      }
      // gifts: claimed once, here and on every other device (your document lists what you claimed)
      const gp = s.settings.privacy.gifts || 'friends';
      for (const g of inb.gifts) {
        if (n.claimed.includes(g.id) || gp === 'none' || (gp === 'friends' && rel !== 'friends')) continue;
        n.claimed.push(g.id);
        if (n.claimed.length > 500) n.claimed.splice(0, n.claimed.length - 500);
        const ob = n.out[uid] || (n.out[uid] = { friend: false, at: 0, msgs: [], gifts: [], claimed: [] });
        ob.claimed = (ob.claimed || []).concat(g.id).slice(-T.maxClaimed);
        BF.economy.earn(g.n, 'Gift from @' + who.username + ' (real player)', 'gift');
        th.msgs.push({ id: 'gift_' + g.id, from: 'them', text: '', ts: Math.min(g.at || now(), now()), read: BF.ui && BF.ui.currentConversation === k, gift: { amount: g.n, dir: 'in' } });
        th.updated = Math.max(th.updated, now());
        notes.push({ type: 'gift', title: who.displayName + ' sent you ' + U.fmt(g.n) + ' ForgeCoins', body: 'A gift from a real player.', icon: 'gift', route: '#/messages/' + k });
        changed = true;
        scheduleWrite();
        schedulePresence(0);
      }
      // game invites
      const inv = inb.invite;
      if (inv && inv.at > (n.seen.inv[uid] || 0)) {
        n.seen.inv[uid] = inv.at;
        changed = true;
        const game = BF.catalog.get(inv.g);
        if (game && now() - inv.at < T.inviteMs && s.settings.privacy.invites) notes.push({ type: 'invite', title: who.displayName + ' invited you to ' + game.name, body: 'Real player · join their server #' + inv.sv + '.', icon: 'gamepad', route: '#/user/' + k, action: { kind: 'invite', gameId: inv.g, serverId: inv.sv } });
      }
      if (!th.msgs.length && !n.threads[uid].updated) delete n.threads[uid];
    }
    // forget the least recently seen strangers past the cap
    const keys = Object.keys(n.people);
    if (keys.length > T.maxPeople) {
      keys.filter((k) => relation(k) !== 'friends').sort((a, b) => (n.people[a].seen || 0) - (n.people[b].seen || 0)).slice(0, keys.length - T.maxPeople).forEach((k) => { delete n.people[k]; });
      changed = true;
    }
    if (changed) BF.store.touch('net');
    for (const note of notes) if (BF.notify) BF.notify.push(note);
    schedulePresence(0); // acknowledgements may shrink what your presence still has to carry (sends only changes)
    // pages re-render only when who is online (or where) changes; status text updates in place
    const live = JSON.stringify(Array.from(peers.entries()).map(([uid, p]) => [uid, p.hidden, p.g, p.sv]).sort());
    if (live !== lastLive) { lastLive = live; touchLive(); }
    else if (BF.shell && BF.shell.updateLive) try { BF.shell.updateLive(); } catch (e) { /* no shell in tests */ }
    BF.bus.emit('net:changed');
  }

  function relationOf(uid, box) {
    const n = netState();
    if (!n) return 'none';
    if (n.blocked.includes(uid)) return 'blocked';
    const mine = n.out[uid];
    const iAsk = !!(mine && mine.friend);
    const theyAsk = !!(box && box.friend) && !(mine && mine.declinedAt && mine.declinedAt >= (box.at || 0));
    if (iAsk && box && box.friend) return 'friends';
    if (theyAsk) return 'incoming';
    if (iAsk) return 'outgoing';
    return 'none';
  }

  function relation(k) {
    const uid = uidOf(k);
    return uid ? relationOf(uid, inbound(uid)) : 'none';
  }

  function box(uid) {
    const n = netState();
    return n.out[uid] || (n.out[uid] = { friend: false, at: 0, declinedAt: 0, msgs: [], gifts: [], claimed: [] });
  }

  function change(uid, fn) {
    BF.store.update('net', () => fn(box(uid)));
    publish();
    queueProcess();
  }

  // ------------------------------------------------------------ public API

  const net = (BF.net = {
    T,
    defaults,
    key,

    /** Is this UI id a real player? */
    isKey(id) { return typeof id === 'string' && id.startsWith('rp-'); },

    /** Connection summary for the UI. */
    state() {
      return { state: phase, me, canWrite, db: !!db, room: !!room && roomUp, hidden: hidden() };
    },

    /** True when real players can be reached from this view. */
    ready() { return phase === 'online'; },

    /**
     * Connect through the artifact runtime (window.claude). Resolves true when
     * online. Without the runtime, or without an identity, BlockForge stays solo.
     * @param {object} [claude] the runtime object (tests inject a mock)
     */
    async connect(claude) {
      const c = claude || (typeof window !== 'undefined' ? window.claude : null);
      if (!c || typeof c.use !== 'function') { phase = 'off'; return false; }
      if (phase === 'connecting' || phase === 'online') return phase === 'online';
      phase = 'connecting';
      touchLive();
      const use = (name) => Promise.race([Promise.resolve().then(() => c.use(name)).catch(() => null), new Promise((r) => setTimeout(() => r(null), T.useTimeoutMs))]);
      const [u, d, r] = await Promise.all([use('user'), use('db'), use('room')]);
      user = u; db = d; room = r;
      me = user ? await Promise.resolve().then(() => user.id()).catch(() => null) : null;
      if (!me || !ID_RE.test(me) || (!db && !room)) { phase = 'unavailable'; db = room = null; touchLive(); return false; }
      canWrite = user && user.can ? await Promise.resolve().then(() => user.can('data.write')).catch(() => null) : null;
      phase = 'online';
      sessionAt = now();
      if (db) {
        try {
          unsubs.push(db.collection(T.coll).limit(T.docLimit).onSnapshot(onDocs, () => { docs.clear(); queueProcess(); }));
        } catch (e) { db = null; }
      }
      if (room) {
        try {
          unsubs.push(room.onPeers(onPeers, () => { peers.clear(); roomUp = false; queueProcess(); }));
          unsubs.push(room.onConnection((up) => { roomUp = up; if (up) { lastPres = {}; schedulePresence(0); } touchLive(); }, () => { roomUp = false; touchLive(); }));
        } catch (e) { room = null; }
      }
      if (!storeOff) {
        // your profile follows your save: avatar, level, fame, name, privacy
        storeOff = BF.store.on(['avatar', 'player', 'settings', 'fame', 'social'], () => publish(true));
        BF.bus.on('store:loaded', () => { recovered = false; lastPres = {}; publish(); queueProcess(); });
      }
      publish();
      touchLive();
      return true;
    },

    /** Drop the connection (tests; signing out keeps it, as the person is the same). */
    disconnect() {
      unsubs.forEach((f) => { try { f(); } catch (e) { /* already gone */ } });
      unsubs = [];
      clearTimeout(writeTimer);
      clearTimeout(presTimer);
      presTimer = null;
      docs.clear();
      peers.clear();
      db = room = user = null;
      me = null;
      phase = 'off';
      canWrite = null;
      recovered = false;
      lastPres = {};
      lastWritten = '';
      gameNow = null;
      if (storeOff) { storeOff(); storeOff = null; }
    },

    /** A real player as a bot-shaped display object (id, username, displayName, avatar, ...), or null. */
    person(k) {
      const n = netState();
      const uid = uidOf(k);
      const p = n && n.people[k];
      if (!uid || !p) return null;
      return { id: k, uid, real: true, username: p.username, displayName: p.displayName, bio: p.bio || '', avatar: p.avatar, level: p.level, fame: p.fame, followers: p.followers, verified: p.verified, gifts: p.gifts, joinDate: p.joinDate || 0, seen: p.seen || 0 };
    },

    /** Every real player you know of (online now, in the directory, or remembered), newest first. */
    people() {
      const n = netState();
      if (!n) return [];
      return Object.keys(n.people).filter((k) => !n.blocked.includes(uidOf(k))).map(net.person).filter(Boolean).sort((a, b) => (net.status(b.id).state !== 'offline') - (net.status(a.id).state !== 'offline') || b.seen - a.seen);
    },

    /** Online status in the same shape as BF.world.botStatus. */
    status(k) {
      const uid = uidOf(k);
      const p = uid && peers.get(uid);
      if (p && !p.hidden) return p.state === 'ingame' ? { state: 'ingame', gameId: p.g, serverId: p.sv, real: true } : { state: 'online', real: true };
      const person = netState() && netState().people[k];
      return { state: 'offline', lastSeen: (person && person.seen) || now() - 86400000, real: true };
    },

    /** Real players matching a search (username or display name). */
    search(q, limit) {
      q = String(q || '').trim().toLowerCase().replace(/^@/, '');
      if (!q) return [];
      return net.people().filter((p) => p.username.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q))
        .sort((a, b) => (b.username.toLowerCase() === q) - (a.username.toLowerCase() === q) || (b.username.toLowerCase().startsWith(q)) - (a.username.toLowerCase().startsWith(q)))
        .slice(0, limit || 20);
    },

    relation,

    /** Friends, incoming and outgoing requests, as display objects. */
    friends() { return net.people().filter((p) => relation(p.id) === 'friends'); },
    incoming() { return net.people().filter((p) => relation(p.id) === 'incoming'); },
    outgoing() { return net.people().filter((p) => relation(p.id) === 'outgoing'); },

    /** Why you cannot reach real players right now, or '' when you can send. */
    blocker() {
      if (phase === 'off') return 'Real players need BlockForge open on claude.ai.';
      if (phase === 'connecting') return 'Connecting to real players...';
      if (phase === 'unavailable') return 'Real players are not available in this view. Open BlockForge from an invitation to it on claude.ai, signed in.';
      if (canWrite === false && !(room && roomUp)) return 'Your access to this BlockForge is view-only. Ask its owner for Contributor access to add friends and send messages.';
      return '';
    },

    request(k) {
      const uid = uidOf(k);
      if (!uid) return { ok: false, error: 'Player not found.' };
      const b = net.blocker();
      if (b) return { ok: false, error: b };
      const rel = relation(k);
      if (rel === 'friends') return { ok: false, error: 'You are already friends.' };
      if (rel === 'blocked') return { ok: false, error: 'Unblock them first.' };
      if (rel === 'outgoing') return { ok: false, error: 'Request already sent.' };
      change(uid, (o) => { o.friend = true; o.at = now(); o.declinedAt = 0; });
      return { ok: true, accepted: rel === 'incoming' };
    },

    accept(k) {
      if (relation(k) !== 'incoming') return { ok: false, error: 'No request from that player.' };
      return net.request(k);
    },

    decline(k) {
      const uid = uidOf(k);
      if (!uid) return { ok: false };
      change(uid, (o) => { o.friend = false; o.declinedAt = now(); });
      return { ok: true };
    },

    cancel(k) {
      const uid = uidOf(k);
      if (!uid) return { ok: false };
      change(uid, (o) => { o.friend = false; o.at = now(); });
      return { ok: true };
    },

    unfriend(k) {
      const uid = uidOf(k);
      if (!uid) return { ok: false };
      change(uid, (o) => { o.friend = false; o.at = now(); o.declinedAt = now(); });
      return { ok: true };
    },

    block(k) {
      const uid = uidOf(k);
      if (!uid) return { ok: false };
      BF.store.update('net', (s) => { if (!s.net.blocked.includes(uid)) s.net.blocked.push(uid); });
      change(uid, (o) => { o.friend = false; o.declinedAt = now(); });
      return { ok: true };
    },

    unblock(k) {
      const uid = uidOf(k);
      if (!uid) return { ok: false };
      BF.store.update('net', (s) => { s.net.blocked = s.net.blocked.filter((x) => x !== uid); });
      queueProcess();
      return { ok: true };
    },

    isBlocked(k) {
      const uid = uidOf(k);
      return !!(uid && netState() && netState().blocked.includes(uid));
    },

    /** Send a private message (stored in your outbox; visible to people with access to this BlockForge). */
    send(k, text) {
      const uid = uidOf(k);
      if (!uid) return { ok: false, error: 'Player not found.' };
      const b = net.blocker();
      if (b) return { ok: false, error: b };
      if (net.isBlocked(k)) return { ok: false, error: 'You blocked this player.' };
      text = clean(text, 1000).trim();
      if (!text) return { ok: false, error: 'Type a message first.' };
      if (text.length > T.maxText) return { ok: false, error: 'Messages to real players can be up to ' + T.maxText + ' characters.' };
      const t = BF.dialogue ? BF.dialogue.filter(text) : text;
      const id = U.uid('m').replace(/[^A-Za-z0-9_.:-]/g, '');
      const at = now();
      BF.store.update(['net', 'player'], (s) => {
        const o = box(uid);
        o.msgs = (o.msgs || []).concat({ id, t, at }).slice(-T.maxMsgs);
        const th = s.net.threads[uid] || (s.net.threads[uid] = { msgs: [], updated: 0 });
        th.msgs.push({ id, from: 'me', text: t, ts: at, read: true });
        if (th.msgs.length > T.maxThread) th.msgs.splice(0, th.msgs.length - T.maxThread);
        th.updated = at;
        s.player.stats.messagesSent += 1;
      });
      if (BF.quests) BF.quests.track('message_sent', 1);
      publish();
      return { ok: true };
    },

    /** The conversation with a real player (messages sorted by time). */
    thread(k) {
      const uid = uidOf(k);
      const n = netState();
      return uid && n && n.threads[uid] ? n.threads[uid] : null;
    },

    /** Conversations with real players, in the Messages page's shape. */
    conversations() {
      const n = netState();
      if (!n) return [];
      return Object.entries(n.threads).map(([uid, th]) => {
        const k = key(uid);
        const who = net.person(k);
        if (!who || !th.msgs.length || n.blocked.includes(uid)) return null;
        return { with: k, who, last: th.msgs[th.msgs.length - 1], unread: th.msgs.filter((m) => m.from === 'them' && !m.read).length, updated: th.updated, real: true };
      }).filter(Boolean);
    },

    unreadCount() {
      const n = netState();
      if (!n) return 0;
      let c = 0;
      for (const [uid, th] of Object.entries(n.threads)) if (!n.blocked.includes(uid)) for (const m of th.msgs) if (m.from === 'them' && !m.read) c++;
      return c;
    },

    markRead(k) {
      const th = net.thread(k);
      if (!th || !th.msgs.some((m) => !m.read)) return;
      BF.store.update('net', () => th.msgs.forEach((m) => { m.read = true; }));
    },

    deleteConversation(k) {
      const uid = uidOf(k);
      if (!uid) return;
      BF.store.update('net', (s) => { const th = s.net.threads[uid]; if (th) th.msgs = []; });
    },

    /** Can you gift this player? {ok, error, max} */
    canGift(k) {
      const p = net.person(k);
      if (!p) return { ok: false, error: 'Player not found.' };
      const b = net.blocker();
      if (b) return { ok: false, error: b };
      if (p.gifts === 'none') return { ok: false, error: p.displayName + ' does not accept gifts.' };
      if (p.gifts === 'friends' && relation(k) !== 'friends') return { ok: false, error: p.displayName + ' only accepts gifts from friends.' };
      return { ok: true, max: Math.min(T.maxGift, BF.economy.balance()) };
    },

    /** Gift ForgeCoins to a real player: they leave your wallet now and arrive when they are next here. */
    gift(k, amount) {
      const c = net.canGift(k);
      if (!c.ok) return c;
      amount = Math.floor(Number(amount));
      if (!(amount >= 1)) return { ok: false, error: 'Pick an amount.' };
      if (amount > T.maxGift) return { ok: false, error: 'Gifts to real players are up to ' + U.fmt(T.maxGift) + ' ForgeCoins.' };
      const p = net.person(k);
      const paid = BF.economy.spend(amount, 'Gift to @' + p.username + ' (real player)', 'gift');
      if (!paid || !paid.ok) return { ok: false, error: 'Not enough ForgeCoins.' };
      const id = U.uid('g').replace(/[^A-Za-z0-9_.:-]/g, '');
      const at = now();
      BF.store.update('net', (s) => {
        const o = box(p.uid);
        o.gifts = (o.gifts || []).concat({ id, n: amount, at }).slice(-T.maxGifts);
        const th = s.net.threads[p.uid] || (s.net.threads[p.uid] = { msgs: [], updated: 0 });
        th.msgs.push({ id: 'gift_' + id, from: 'me', text: '', ts: at, read: true, gift: { amount, dir: 'out' } });
        th.updated = at;
      });
      publish();
      return { ok: true, amount };
    },

    /** Has a gift you sent been picked up? */
    giftDelivered(k, giftId) {
      const uid = uidOf(k);
      const b = uid && inbound(uid);
      return !!(b && b.claimed.includes(giftId));
    },

    /** Invite a real friend to the server you are playing on. */
    invite(k) {
      const uid = uidOf(k);
      const w = BF.world && BF.world.session;
      if (!uid || !w) return { ok: false, error: 'Join a game first.' };
      if (relation(k) !== 'friends') return { ok: false, error: 'You can invite friends.' };
      change(uid, (o) => { o.invite = { g: w.gameId, sv: String(w.serverId), at: now() }; });
      return { ok: true };
    },

    /** Join the server a real player is on. */
    join(k) {
      const st = net.status(k);
      if (st.state !== 'ingame') return { ok: false, error: 'They are not in a game right now.' };
      BF.play(st.gameId, st.serverId);
      return { ok: true };
    },

    /** Is a real player (or an invite) on this server? The world keeps it open for you if so. */
    isShared(gameId, serverId) {
      serverId = String(serverId);
      for (const p of peers.values()) if (p.g === gameId && p.sv === serverId) return true;
      const n = netState();
      if (n) for (const uid of Object.keys(n.seen.inv)) { const b = inbound(uid); if (b && b.invite && b.invite.g === gameId && b.invite.sv === serverId) return true; }
      return false;
    },

    // ---------------------------------------------------------- in-game

    /**
     * The runtime reports where you are: {g, sv, pos:[x,y,z,yaw,move], sc} while
     * playing, or null in menus. Positions are sent at most ~8 times a second.
     */
    gameState(st) {
      const prevG = gameNow && gameNow.g + '#' + gameNow.sv;
      gameNow = st && st.g ? { g: st.g, sv: String(st.sv), pos: st.pos || null, sc: st.sc || null } : null;
      if (!gameNow) sayNow = null;
      const nextG = gameNow && gameNow.g + '#' + gameNow.sv;
      if (prevG !== nextG) { lastPres.pos = undefined; schedulePresence(0); return; }
      const t = now();
      if (t - posAt >= T.presence.posMs) { posAt = t; schedulePresence(0); }
    },

    /** Say something in the server chat, heard by real players in the same server. */
    say(text) {
      if (!gameNow) return;
      const t = clean(text, 120).trim();
      if (!t) return;
      sayNow = { id: U.uid('s').replace(/[^A-Za-z0-9_.:-]/g, ''), t, at: now() };
      schedulePresence(0);
    },

    /** Real players on a server right now: [{key, uid, person, pos, sc, say}]. */
    playersIn(gameId, serverId) {
      const out = [];
      serverId = String(serverId);
      const n = netState();
      for (const [uid, p] of peers) {
        if (p.hidden || p.g !== gameId || p.sv !== serverId || (n && n.blocked.includes(uid))) continue;
        const k = key(uid);
        const person = net.person(k) || (p.profile ? Object.assign({ id: k, uid, real: true }, p.profile) : null);
        if (!person) continue;
        out.push({ key: k, uid, person, pos: p.pos, sc: p.sc, say: p.say, t: p.t });
      }
      return out;
    },

    /** Real players online now (excluding you). */
    onlineCount() {
      let c = 0;
      for (const p of peers.values()) if (!p.hidden) c++;
      return c;
    },

    // test hooks
    _process: process,
    _flush: flushWrite,
    _presence: sendPresence,
    _inbound(k) { const uid = uidOf(k); return uid ? inbound(uid) : null; },
  });
})((window.BF = window.BF || {}));
