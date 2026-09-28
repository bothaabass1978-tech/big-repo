/**
 * BlockForge real-multiplayer end-to-end test (Playwright + Chromium, ADR-0017).
 *
 *   node tests/blockforge/e2e/multiplayer_e2e_test.js [--shots <dir>]
 *
 * Two separate browsers (separate saves), one shared artifact runtime: the
 * mock in tests/blockforge/mock_claude.js runs in this Node process and each
 * page reaches it through tests/blockforge/e2e/mock_claude_page.js. Covers
 * finding the other player by username, a friend request accepted in the UI,
 * a private message, joining the friend's exact server and seeing their
 * character and chat in the game, a gift, and a view-only third player.
 * Exits non-zero on any failed check or page error.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { createHub } = require('../mock_claude');

let pw;
try { pw = require('playwright'); } catch (e) {
  try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (e2) { console.error('Playwright is required: npm i -D playwright'); process.exit(2); }
}

const APP = 'file://' + path.resolve(__dirname, '../../../src/blockforge/index.html');
const PAGE_MOCK = fs.readFileSync(path.join(__dirname, 'mock_claude_page.js'), 'utf8');
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > 0 ? process.argv[shotsArg + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail && !ok ? ' — ' + detail : ''));
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One real person: their own browser context, save and runtime client. */
async function person(browser, hub, uid, username, o) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  const client = hub.client(Object.assign({ uid }, o || {}));
  const spaces = {};
  const push = (id, payload) => page.evaluate(([i, p]) => window.__hubPush && window.__hubPush(i, p), [id, payload]).catch(() => {});
  await page.exposeBinding('__hub', async (source, op, args) => {
    const name = op.split('.')[0];
    if (op === 'use') { spaces[args[0]] = await client.claude.use(args[0]); return !!spaces[args[0]]; }
    const sp = spaces[name] || (spaces[name] = await client.claude.use(name));
    try {
      if (op === 'user.id') return await sp.id();
      if (op === 'user.can') return await sp.can(args[0]);
      if (op === 'db.set') { await sp.doc(args[0]).set(args[1]); return {}; }
      if (op === 'db.get') { const d = await sp.doc(args[0]).get(); return d.exists ? d.data() : null; }
      if (op === 'db.sub') { sp.collection(args[0]).limit(args[1]).onSnapshot((snap) => push(args[2], snap.docs.map((d) => ({ id: d.id, data: d.data() })))); return true; }
      if (op === 'room.presence') { await sp.presence(args[0]); return {}; }
      if (op === 'room.peers') { sp.onPeers((ch) => push(args[0], { peers: ch.peers.map((p) => Object.assign({}, p)), joined: [], left: [], updated: [] })); return true; }
    } catch (e) { return { error: e.code || 'upstream_error' }; }
    return null;
  });
  await page.addInitScript(PAGE_MOCK);
  await page.goto(APP);
  await page.waitForSelector('.acct', { timeout: 10000 });
  await page.click('.acct');
  await page.waitForTimeout(900);
  await page.keyboard.press('Escape'); // daily reward
  await page.evaluate((n) => BF.store.update('player', (s) => { s.player.username = n; s.player.displayName = n; }), username);
  return { page, ctx, client, uid, username };
}

(async () => {
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const hub = createHub();
  const A = await person(browser, hub, 'u_owner', 'ForgeCaptain');
  const B = await person(browser, hub, 'u_friend', 'BuddyBlocks');
  await wait(3500);

  const netState = (p) => p.page.evaluate(() => BF.net.state());
  const sa = await netState(A), sb = await netState(B);
  check('both players are connected to real players', sa.state === 'online' && sb.state === 'online', JSON.stringify({ sa, sb }));
  check('each player has a directory document', hub.docs.has('p/u_owner') && hub.docs.has('p/u_friend'));

  // ---- B searches A's username (the original bug: "he searched my username and it didn't show up")
  await B.page.fill('#global-search', 'ForgeCap');
  await wait(600);
  const suggest = await B.page.evaluate(() => (document.getElementById('search-suggest') || {}).innerText || '');
  check('the top search suggests the real player by username', /ForgeCaptain/.test(suggest), suggest.slice(0, 200));
  await B.page.keyboard.press('Escape');
  await B.page.evaluate(() => BF.router.go('#/friends/find'));
  await wait(400);
  await B.page.fill('#find-q', 'forgecaptain');
  await wait(900);
  const found = await B.page.evaluate(() => document.querySelector('.real-list') ? document.querySelector('.real-list').innerText : '');
  check('Find Players lists them as a real player', /ForgeCaptain/.test(found) && /Real player/.test(found), found.slice(0, 200));
  await shot(B.page, 'mp-01-find');

  // ---- friend request, accepted from the other browser's UI
  await B.page.click('.real-list [data-act="rp-add"]');
  await wait(2500);
  await A.page.evaluate(() => BF.router.go('#/friends/requests'));
  await wait(700);
  const hasReq = await A.page.waitForSelector('.real-list [data-act="rp-accept"]', { timeout: 5000 }).catch(() => null);
  check('the request shows up in the other player\'s Requests', !!hasReq);
  const badge = await A.page.evaluate(() => (document.getElementById('nb-friends') || {}).textContent);
  check('the Friends badge counts the real request', Number(badge) >= 1, badge);
  await shot(A.page, 'mp-02-request');
  if (hasReq) await A.page.click('.real-list [data-act="rp-accept"]');
  await wait(2500);
  const rel = await Promise.all([A, B].map((p) => p.page.evaluate(() => { const k = BF.net.people()[0]; return k ? BF.net.relation(k.id) : 'none'; })));
  check('both players are now friends', rel[0] === 'friends' && rel[1] === 'friends', rel.join(','));

  // ---- a private message through the Messages page
  const kA = await B.page.evaluate(() => BF.net.people()[0].id);
  await B.page.evaluate((k) => BF.router.go('#/messages/' + k), kA);
  await wait(600);
  await B.page.fill('#compose-text', 'yo its me, join my obby later?');
  await B.page.keyboard.press('Enter');
  await wait(2500);
  const got = await A.page.evaluate(() => { const c = BF.net.conversations()[0]; return c ? { text: c.last.text, unread: c.unread } : null; });
  check('the message arrives unread in the other browser', got && got.text === 'yo its me, join my obby later?' && got.unread === 1, JSON.stringify(got));
  const kB = await A.page.evaluate(() => BF.net.people()[0].id);
  await A.page.evaluate((k) => BF.router.go('#/messages/' + k), kB);
  await wait(700);
  await shot(A.page, 'mp-03-messages');

  // ---- A plays; B joins the same server and sees A's character and chat
  await A.page.evaluate(() => BF.runtime.launch('block-battlegrounds'));
  await wait(4000);
  const srvA = await A.page.evaluate(() => { const s = BF.runtime.session(); return s && s.server.id; });
  await wait(1200);
  await B.page.evaluate(() => BF.router.go('#/friends'));
  await wait(700);
  const joinBtn = await B.page.waitForSelector('.real-list [data-act="rp-join"]', { timeout: 5000 }).catch(() => null);
  check('the friend shows as in a game with a Join button', !!joinBtn);
  if (joinBtn) await B.page.click('.real-list [data-act="rp-join"]');
  await wait(5000);
  const srvB = await B.page.evaluate(() => { const s = BF.runtime.session(); return s && s.server.id; });
  check('joining lands on the same server number', srvA && srvA === srvB, srvA + ' vs ' + srvB);
  await A.page.evaluate(() => { const b = [...document.querySelectorAll('.gr-frame button')].find((x) => /^\s*start/i.test(x.textContent)); if (b) b.click(); });
  await B.page.evaluate(() => { const b = [...document.querySelectorAll('.gr-frame button')].find((x) => /^\s*start/i.test(x.textContent)); if (b) b.click(); });
  await wait(3500);
  const seeB = await B.page.evaluate(() => { const s = BF.runtime.session(); const a = s.g3 && Array.from(s.g3.actors.keys()).find((k) => k.startsWith('net-')); return { real: s.real.size, actor: !!a, count: document.getElementById('gr-count').textContent }; });
  const seeA = await A.page.evaluate(() => { const s = BF.runtime.session(); return { real: s.real.size }; });
  check('each sees the other on the server (roster)', seeA.real === 1 && seeB.real === 1, JSON.stringify({ seeA, seeB }));
  check('the friend\'s character is drawn in 3D', seeB.actor, JSON.stringify(seeB));
  await A.page.focus('#gr-chat-input').catch(() => {});
  await A.page.fill('#gr-chat-input', 'hello from the other browser');
  await A.page.keyboard.press('Enter');
  await wait(1500);
  const chat = await B.page.evaluate(() => document.getElementById('gr-chat-log').innerText);
  check('in-game chat reaches the other real player', /hello from the other browser/.test(chat), chat.slice(-200));
  await shot(B.page, 'mp-04-same-server');
  await A.page.evaluate(() => BF.runtime.leave(true));
  await B.page.evaluate(() => BF.runtime.leave(true));
  await wait(1500);

  // ---- a gift between real friends
  const before = await A.page.evaluate(() => BF.economy.balance());
  const sent = await B.page.evaluate((k) => BF.net.gift(k, 250), kA);
  await wait(2500);
  const after = await A.page.evaluate(() => BF.economy.balance());
  check('a gift from a real friend arrives once', sent.ok && after === before + 250, JSON.stringify({ sent, before, after }));

  // ---- a view-only third player: visible while online, cannot write the directory
  const C = await person(browser, hub, 'u_viewer', 'QuietViewer', { canWrite: false });
  await wait(3000);
  const cFound = await A.page.evaluate(() => BF.net.search('quietviewer').length);
  check('a view-only player still shows up while online', cFound === 1 && !hub.docs.has('p/u_viewer'), String(cFound));
  const cReq = await C.page.evaluate(() => { const k = BF.net.search('forgecaptain')[0]; return k ? BF.net.request(k.id) : { ok: false, error: 'not found' }; });
  await wait(2000);
  const cRel = await A.page.evaluate(() => { const k = BF.net.search('quietviewer')[0]; return k ? BF.net.relation(k.id) : 'none'; });
  check('a view-only player can still send a friend request (live)', cReq.ok && cRel === 'incoming', JSON.stringify({ cReq, cRel }));

  // ---- leaving: the friend goes offline but stays a friend
  B.client.leave();
  await B.ctx.close();
  await wait(1500);
  const off = await A.page.evaluate((k) => ({ st: BF.net.status(k).state, friends: BF.net.friends().length }), kB);
  check('a friend who closes BlockForge shows offline and stays a friend', off.st === 'offline' && off.friends === 1, JSON.stringify(off));
  await A.page.evaluate(() => BF.router.go('#/friends'));
  await wait(700);
  await shot(A.page, 'mp-05-friends');

  for (const p of [A, C]) check(p.username + ' run has no page errors', !p.page.errors.length, p.page.errors.slice(0, 3).join(' | '));
  const passed = results.filter((r) => r.ok).length;
  console.log('\n' + passed + ' / ' + results.length + ' checks passed');
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
