/**
 * Page side of the multiplayer e2e test: a window.claude whose db, room and
 * user namespaces forward every call to the Node test process (binding
 * __hub), where tests/blockforge/mock_claude.js holds the shared state. Node
 * pushes snapshots and room changes back through window.__hubPush.
 * Injected with addInitScript before BlockForge loads.
 */
(() => {
  const subs = new Map();
  let seq = 0;
  window.__hubPush = (id, payload) => { const f = subs.get(id); if (f) f(payload); };
  const call = (op, ...args) => window.__hub(op, args);
  const fail = (r) => { if (r && r.error) throw Object.assign(new Error(r.error), { code: r.error }); return r; };
  const snap = (docs) => {
    const list = docs.map((d) => ({ id: d.id, exists: true, data: () => d.data, metadata: { fromCache: false, hasPendingWrites: false } }));
    return { docs: list, size: list.length, empty: !list.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const db = {
    doc(path) {
      return {
        id: path.split('/').pop(),
        path,
        set: (body) => call('db.set', path, body).then(fail),
        get: () => call('db.get', path).then((d) => ({ id: path.split('/').pop(), exists: !!d, data: () => d || undefined, metadata: {} })),
        update: () => Promise.reject(Object.assign(new Error('invalid_argument'), { code: 'invalid_argument' })),
        delete: () => Promise.resolve(),
      };
    },
    collection(coll) {
      const q = (limit) => ({
        path: coll,
        limit: (n) => q(n),
        where: () => q(limit),
        orderBy: () => q(limit),
        doc: (id) => db.doc(coll + '/' + id),
        onSnapshot(fn) {
          const id = ++seq;
          subs.set(id, (docs) => fn(snap(docs)));
          call('db.sub', coll, limit, id);
          return () => subs.delete(id);
        },
      });
      return q(1000);
    },
  };
  const room = {
    presence: (patch) => call('room.presence', patch).then(fail),
    onPeers(fn) { const id = ++seq; subs.set(id, fn); call('room.peers', id); return () => subs.delete(id); },
    onConnection(fn) { setTimeout(() => fn(true), 0); return () => {}; },
    connected: () => true,
    peers: () => [],
    emit: () => Promise.reject(Object.assign(new Error('not_permitted'), { code: 'not_permitted' })),
    on: () => () => {},
  };
  const user = {
    id: () => call('user.id'),
    can: (name) => call('user.can', name),
    isOwner: () => Promise.resolve(false),
    canEdit: () => Promise.resolve(false),
    me: () => call('user.id').then((id) => ({ id, name: '', avatarUrl: '', color: '#888', email: null, isOwner: false, canEdit: false })),
    profiles: () => Promise.resolve({}),
  };
  const spaces = { db, room, user };
  window.claude = { use: (name) => call('use', name).then((ok) => (ok ? spaces[name] : null)) };
})();
