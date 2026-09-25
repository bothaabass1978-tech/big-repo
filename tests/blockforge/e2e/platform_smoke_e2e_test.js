/**
 * BlockForge end-to-end smoke test (Playwright + Chromium).
 *
 *   node tests/blockforge/e2e/platform_smoke_e2e_test.js [--shots <dir>]
 *
 * Covers: sign-in, daily reward, every page route, a shop purchase and the
 * "Not enough ForgeCoins." path, launching and leaving all 20 games, creator
 * games built from every template, save export/import, and a phone-sized
 * viewport with touch controls. Exits non-zero on any failed check or page error.
 */
'use strict';

const path = require('path');
const fs = require('fs');

let pw;
try { pw = require('playwright'); } catch (e) {
  try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (e2) { console.error('Playwright is required: npm i -D playwright'); process.exit(2); }
}

const APP = 'file://' + path.resolve(__dirname, '../../../src/blockforge/index.html');
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > 0 ? process.argv[shotsArg + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail && !ok ? ' — ' + detail : ''));
}

async function newPage(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, opts || {}));
  // external fonts are optional; keep the run offline-friendly
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) page.errors.push('console: ' + m.text()); });
  return page;
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };

async function signIn(page) {
  await page.goto(APP);
  await page.waitForSelector('.acct', { timeout: 10000 });
  await page.click('.acct');
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await pw.chromium.launch();
  const page = await newPage(browser);
  await signIn(page);
  await shot(page, '01-home-daily');
  const dailyBefore = await page.evaluate(() => ({ bal: BF.economy.balance(), amount: BF.daily.status().nextAmount }));
  const claimBtn = await page.waitForSelector('#daily-claim-btn', { timeout: 4000 }).catch(() => null);
  if (claimBtn) { await claimBtn.click(); await page.waitForTimeout(600); }
  const dailyAfter = await page.evaluate(() => ({ bal: BF.economy.balance(), last: BF.economy.history()[0] }));
  check('daily reward pops up on sign-in and claiming pays out with a ledger entry', !!claimBtn && dailyAfter.bal === dailyBefore.bal + dailyBefore.amount && dailyAfter.last.cat === 'daily', JSON.stringify({ dailyBefore, dailyAfter }));
  await page.keyboard.press('Escape');
  const header = await page.evaluate(() => ({ bal: BF.economy.balance(), text: (document.querySelector('.coin-chip, .fc-chip, [data-act="wallet"]') || {}).textContent || '' }));
  check('signed in as ForgePlayer with a ForgeCoin balance', header.bal >= 1500, JSON.stringify(header));
  await page.click('#coin-pill');
  await page.waitForTimeout(350);
  const walletHash = await page.evaluate(() => location.hash);
  check('clicking the ForgeCoins balance opens the wallet', walletHash === '#/wallet', walletHash);

  // ------------------------------------------------------------ routes
  const routes = ['#/home', '#/discover', '#/games', '#/game/block-battlegrounds', '#/game/block-battlegrounds/servers', '#/game/block-battlegrounds/store', '#/shop', '#/shop/accessories', '#/shop/bundles', '#/inventory', '#/inventory/passes', '#/avatar', '#/friends', '#/messages', '#/notifications', '#/create', '#/create/new', '#/profile', '#/profile/badges', '#/settings', '#/settings/appearance', '#/settings/data', '#/wallet', '#/quests', '#/achievements', '#/leaderboards', '#/search?q=block'];
  for (const r of routes) {
    const before = page.errors.length;
    await page.evaluate((h) => { location.hash = h; }, r);
    await page.waitForTimeout(350);
    const content = await page.evaluate(() => (document.querySelector('#app main, #app .page, #app') || document.body).innerText.length);
    check('route ' + r + ' renders', content > 40 && page.errors.length === before, page.errors.slice(before).join(' | '));
  }
  await shot(page, '02-search');

  // ------------------------------------------------------------ shop
  await page.evaluate(() => { location.hash = '#/shop/accessories'; });
  await page.waitForTimeout(400);
  const target = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('[data-act="buy-item"]'));
    const b = btns.map((x) => ({ x, item: BF.ITEMS[x.dataset.item] })).filter((o) => o.item && o.item.price <= BF.economy.balance()).sort((a, b2) => a.item.price - b2.item.price)[0];
    if (!b) return null;
    b.x.setAttribute('data-e2e', 'buy');
    return b.item.id;
  });
  if (target) {
    await page.click('[data-e2e="buy"]');
    await page.waitForSelector('.modal-scrim', { timeout: 3000 });
    const buyBtn = await page.$('.modal-scrim .btn-primary');
    await buyBtn.click();
    await page.waitForTimeout(500);
    const title = await page.textContent('.modal-scrim .modal-title').catch(() => '');
    check('buying an item shows "Purchase successful!"', title.trim() === 'Purchase successful!', title);
    check('bought item is in the inventory', await page.evaluate((id) => BF.inventory.owns(id), target));
    await shot(page, '03-purchase');
    await page.keyboard.press('Escape');
  } else check('found an affordable accessory to buy', false);
  await page.evaluate(() => { BF.economy.spend(BF.economy.balance() - 5, 'e2e: drain wallet', 'debug'); location.hash = '#/shop/bundles'; });
  await page.waitForTimeout(400);
  const pricey = await page.$('[data-act="buy-item"]');
  if (pricey) {
    await pricey.click();
    await page.waitForSelector('.modal-scrim', { timeout: 3000 });
    const t2 = await page.textContent('.modal-scrim .modal-title');
    check('insufficient funds shows "Not enough ForgeCoins."', t2.trim() === 'Not enough ForgeCoins.', t2);
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => BF.economy.earn(5000, 'e2e: refill', 'debug'));

  // ------------------------------------------------------------ games
  const games = await page.evaluate(() => BF.GAME_REGISTRY.map((g) => g.id));
  check('20 built-in games are registered', games.length === 20, String(games.length));
  const keys = ['KeyW', 'KeyD', 'Space', 'KeyS', 'KeyA', 'KeyE', 'KeyJ'];
  for (const id of games) {
    const before = page.errors.length;
    await page.evaluate((gid) => { location.hash = '#/game/' + gid; }, id);
    await page.waitForTimeout(300);
    await page.click('#play-btn');
    await page.waitForTimeout(2300);
    const box = await page.$eval('#gr-canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }).catch(() => null);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.down(keys[i % keys.length]);
      if (box) await page.mouse.click(box.x + box.w * (0.3 + 0.1 * i), box.y + box.h * 0.5);
      await page.waitForTimeout(160);
      await page.keyboard.up(keys[i % keys.length]);
    }
    const running = await page.evaluate(() => BF.runtime.active);
    if (id === 'mystery-mansion' || id === 'pet-battle-arena') await shot(page, '04-game-' + id);
    await page.evaluate(() => BF.runtime.leave());
    await page.waitForTimeout(200);
    check('game ' + id + ' launches, runs and exits cleanly', running && page.errors.length === before, page.errors.slice(before).join(' | '));
  }

  // ------------------------------------------------------------ creator
  const made = await page.evaluate(() => {
    const out = [];
    for (const tpl of Object.keys(BF.creator.TEMPLATES)) {
      const r = BF.creator.create({ name: 'E2E ' + tpl + ' ' + Date.now().toString(36), description: 'Made by the e2e test.', genre: BF.creator.TEMPLATES[tpl].genre, maxPlayers: 10, template: tpl, visibility: 'public', difficulty: 'normal', thumbnail: { color: '#46a8ff', pattern: 'grid' } });
      if (r.ok) { BF.creator.publish(r.game.id); out.push(r.game.id); }
    }
    return out;
  });
  check('creator made and published a game from every template', made.length === 5, made.join(','));
  for (const id of made) {
    const before = page.errors.length;
    await page.evaluate((gid) => BF.play(gid), id);
    await page.waitForTimeout(2200);
    await page.keyboard.press('Space');
    const running = await page.evaluate(() => BF.runtime.active);
    await page.evaluate(() => BF.runtime.leave());
    await page.waitForTimeout(150);
    check('creator game ' + id + ' is playable', running && page.errors.length === before, page.errors.slice(before).join(' | '));
  }
  const cleaned = await page.evaluate((ids) => ids.every((id) => BF.creator.remove(id).ok), made);
  check('creator games can be deleted', cleaned);

  // ------------------------------------------------------------ save data
  const roundTrip = await page.evaluate(() => {
    const snap = JSON.parse(JSON.stringify(BF.store.exportData()));
    const bal = BF.economy.balance();
    BF.economy.spend(100, 'e2e: change something', 'debug');
    const r = BF.store.importData(snap);
    return r.ok && BF.economy.balance() === bal;
  });
  check('save export and import round-trips', roundTrip);

  // with automatic saving switched off, closing or reloading the page must not persist changes
  await page.evaluate(() => { location.hash = '#/settings/data'; });
  await page.waitForTimeout(400);
  await page.click('label[for="data.autosave"]');
  await page.waitForTimeout(200);
  const savedBal = await page.evaluate(() => { const b = BF.economy.balance(); BF.economy.earn(250, 'e2e: unsaved change', 'debug'); return b; });
  await page.reload();
  await page.waitForSelector('#topbar', { timeout: 10000 });
  await page.waitForTimeout(600);
  const afterReload = await page.evaluate(() => ({ bal: BF.economy.balance(), autosave: BF.store.state.settings.data.autosave }));
  check('autosave off: a reload does not save unsaved changes', afterReload.bal === savedBal && afterReload.autosave === false, JSON.stringify(afterReload) + ' expected ' + savedBal);
  await page.evaluate(() => { BF.store.update('settings', (s) => { s.settings.data.autosave = true; }); BF.store.save('manual'); });

  // ------------------------------------------------------------ mobile
  const phone = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await signIn(phone);
  await phone.keyboard.press('Escape');
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone layout has no horizontal scroll', overflow <= 1, 'overflow ' + overflow + 'px');
  await shot(phone, '05-phone-home');
  await phone.evaluate(() => { location.hash = '#/game/sky-obby'; });
  await phone.waitForTimeout(400);
  await phone.click('#play-btn');
  await phone.waitForTimeout(2400);
  const touch = await phone.evaluate(() => { const el = document.querySelector('#gr-touch'); return !!el && !el.hidden && el.children.length > 0; });
  check('touch controls appear on a touch device', touch);
  await shot(phone, '06-phone-game');
  check('phone run has no page errors', phone.errors.length === 0, phone.errors.join(' | '));

  check('desktop run has no page errors', page.errors.length === 0, page.errors.join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + ' / ' + results.length + ' checks passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
