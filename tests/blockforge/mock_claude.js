/**
 * In-memory stand-in for the artifact runtime (window.claude) used by BF.net
 * tests: the `db`, `room` and `user` capabilities, shared by several simulated
 * viewers through one hub. It follows the published contract closely enough to
 * exercise BlockForge's multiplayer code: per-viewer ids, the p/{self} write rule
 * (and view-only viewers whose writes reject `invalid_argument`), query
 * snapshots, presence merges with the 4 KiB limit and onPeers deliveries.
 *
 *   const hub = createHub();
 *   const claudeA = hub.client({ uid: 'u_alice' });
 *   const claudeB = hub.client({ uid: 'u_bob', canWrite: false });
 *   hub.settle() resolves after every queued delivery.
 */
'use strict';

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };

function createHub(opts) {
  opts = opts || {};
  const docs = new Map(); // path -> body
  const docListeners = new Set(); // {coll, limit, fn}
  const peers = new Map(); // peer -> {client, presence, updatedAt}
  const peerListeners = new Set(); // {client, fn}
  let queue = Promise.resolve();
  let peerSeq = 0;
  const writes = [];

  const later = (fn) => { queue = queue.then(() => new Promise((r) => setImmediate(() => { try { fn(); } finally { r(); } }))); };

  function querySnap(coll, limit) {
    const list = Array.from(docs.entries()).filter(([p]) => p.split('/').length === 2 && p.split('/')[0] === coll).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, limit || 1000);
    const out = list.map(([p, body]) => { const data = deepFreeze(clone(body)); return { id: p.split('/')[1], exists: true, data: () => data, metadata: { fromCache: false, hasPendingWrites: false } }; });
    return { docs: out, size: out.length, empty: !out.length, docChanges: () => out.map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i })), metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function notifyDocs(coll) {
    for (const l of docListeners) if (l.coll === coll) later(() => l.fn(querySnap(coll, l.limit)));
  }

  function peerView(forClient) {
    return Array.from(peers.entries()).map(([peer, p]) => Object.freeze({ peer, by: p.client.uid, isMe: p.client.uid === forClient.uid, sameTab: p.client === forClient, kind: 'viewer', guest: false, presence: deepFreeze(clone(p.presence)), updatedAt: p.updatedAt }));
  }
  function notifyPeers(joined, left) {
    for (const l of peerListeners) {
      const list = peerView(l.client);
      later(() => l.fn({ peers: list, joined: joined ? list.filter((x) => x.peer === joined) : [], left: left ? [{ peer: left }] : [], updated: [] }));
    }
  }

  function client(o) {
    const c = { uid: o.uid, canWrite: o.canWrite !== false, hasDb: o.db !== false, hasRoom: o.room !== false, peer: null };
    const reject = (code) => Promise.reject(Object.assign(new Error(code), { code }));

    const dbApi = {
      doc(path) {
        const segs = path.split('/');
        if (segs.length % 2) throw new TypeError('document paths have an even number of segments');
        return {
          id: segs[segs.length - 1],
          path,
          get: () => Promise.resolve(docs.has(path) ? { id: segs[segs.length - 1], exists: true, data: () => deepFreeze(clone(docs.get(path))), metadata: {} } : { id: segs[segs.length - 1], exists: false, data: () => undefined, metadata: {} }),
          set(body) {
            // rules: p/{self} writable at interact; everyone else rejects like a hidden path
            if (!c.canWrite || (segs[0] === 'p' && segs[1] !== c.uid)) return reject('invalid_argument');
            if (!body || typeof body !== 'object' || Array.isArray(body)) return reject('invalid_argument');
            if (JSON.stringify(body).length > 256 * 1024) return reject('invalid_argument');
            docs.set(path, clone(body));
            writes.push({ uid: c.uid, path });
            notifyDocs(segs.slice(0, -1).join('/'));
            return new Promise((r) => setImmediate(r));
          },
          update() { return reject('invalid_argument'); },
          delete() { docs.delete(path); notifyDocs(segs.slice(0, -1).join('/')); return Promise.resolve(); },
        };
      },
      collection(coll) {
        const q = (limit) => ({
          path: coll,
          limit: (n) => q(n),
          where: () => q(limit),
          orderBy: () => q(limit),
          get: () => Promise.resolve(querySnap(coll, limit)),
          onSnapshot(fn) {
            const l = { coll, limit, fn };
            docListeners.add(l);
            later(() => fn(querySnap(coll, limit)));
            return () => docListeners.delete(l);
          },
          doc: (id) => dbApi.doc(coll + '/' + id),
        });
        return q(1000);
      },
    };

    const roomApi = {
      presence(patch) {
        const me = peers.get(c.peer);
        const next = Object.assign({}, me ? me.presence : {});
        for (const [k, v] of Object.entries(patch)) { if (v === null) delete next[k]; else next[k] = clone(v); }
        if (JSON.stringify(next).length > 4096) return reject('invalid_argument');
        if (me) { me.presence = next; me.updatedAt = Date.now(); }
        notifyPeers();
        return Promise.resolve();
      },
      onPeers(fn) {
        const l = { client: c, fn };
        peerListeners.add(l);
        if (!c.peer) {
          c.peer = 'peer' + (++peerSeq);
          peers.set(c.peer, { client: c, presence: {}, updatedAt: Date.now() });
          notifyPeers(c.peer);
        } else later(() => fn({ peers: peerView(c), joined: peerView(c), left: [], updated: [] }));
        return () => peerListeners.delete(l);
      },
      onConnection(fn) { later(() => fn(true)); return () => {}; },
      connected: () => true,
      peers: () => peerView(c),
      emit: () => reject('not_permitted'),
      on: () => () => {},
    };

    const userApi = {
      id: () => Promise.resolve(c.uid),
      me: () => Promise.resolve({ id: c.uid, name: '', avatarUrl: '', color: '#888', email: null, isOwner: false, canEdit: false }),
      can: (name) => Promise.resolve(name === 'data.write' ? c.canWrite : false),
      canEdit: () => Promise.resolve(false),
      isOwner: () => Promise.resolve(false),
      profiles: (ids) => Promise.resolve({}),
    };

    c.claude = {
      use(name) {
        if (name === 'db') return Promise.resolve(c.hasDb ? dbApi : null);
        if (name === 'room') return Promise.resolve(c.hasRoom ? roomApi : null);
        if (name === 'user') return Promise.resolve(userApi);
        return Promise.resolve(null);
      },
    };
    /** The viewer closes the page: their presence leaves the room. */
    c.leave = () => {
      if (!c.peer) return;
      const peer = c.peer;
      peers.delete(peer);
      for (const l of Array.from(peerListeners)) if (l.client === c) peerListeners.delete(l);
      c.peer = null;
      notifyPeers(null, peer);
    };
    return c;
  }

  return {
    client,
    docs,
    writes,
    /** Resolve after every delivery queued so far (and those they queue). */
    async settle() {
      for (let i = 0; i < 6; i++) { await queue; await new Promise((r) => setImmediate(r)); }
    },
    presenceOf(uid) { for (const p of peers.values()) if (p.client.uid === uid) return p.presence; return null; },
  };
}

module.exports = { createHub };
