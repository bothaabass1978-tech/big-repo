/**
 * BlockForge — the Forgecore terminal.
 * A fictional, local-only developer console reachable after the cellar
 * furnace puzzle. It grants any positive amount of the fictional ForgeCoins
 * through BF.secrets.execute(), which writes a "FORGECORE" ledger entry.
 * Entry points: the lit furnace in Mystery Mansion, the Forgecore badge on the
 * profile, and typing "forgecore" anywhere once unlocked.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;
  let el = null;
  let timers = [];

  const BOOT = [
    ['FORGECORE v0.9.1 — LOCAL MAINTENANCE CONSOLE', 'dim'],
    ['> igniting ember lattice ............ OK', ''],
    ['> syncing ledger shards ............. OK', ''],
    ['> listening for the old rhythm ...... OK', ''],
    ['> binding to local save ............. OK', ''],
    ['', ''],
    ['SYSTEM STATUS: ONLINE', 'ok'],
  ];

  function line(text, cls) {
    if (!el) return null;
    const out = el.querySelector('.fc-out');
    const div = document.createElement('div');
    div.className = 'fc-line ' + (cls || '');
    div.textContent = text;
    out.appendChild(div);
    out.scrollTop = out.scrollHeight;
    return div;
  }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function boot() {
    const name = BF.store.state ? BF.store.state.player.username : 'FORGER';
    let delay = 150;
    BOOT.forEach(([t, c]) => { later(() => { line(t, c); BF.sfx.play('type', { volume: 0.4 }); }, delay); delay += t ? 230 : 120; });
    later(() => { line('WELCOME BACK, ' + name.toUpperCase() + '.', 'ok'); }, delay += 200);
    later(() => { line(''); line('ENTER FORGECOIN AMOUNT', 'prompt'); ready(); }, delay += 450);
  }

  function ready() {
    if (!el) return;
    el.querySelector('.fc-form').hidden = false;
    const inp = el.querySelector('#fc-amount');
    inp.focus();
  }

  function execute() {
    if (!el) return;
    const inp = el.querySelector('#fc-amount');
    const raw = inp.value.trim();
    if (!raw) { inp.focus(); return; }
    line('> ' + raw, 'echo');
    const btn = el.querySelector('.fc-exec');
    btn.disabled = true;
    const bar = line('PROCESSING [                    ]', 'dim');
    let k = 0;
    const tick = () => {
      if (!el) return;
      k++;
      bar.textContent = 'PROCESSING [' + '#'.repeat(k) + ' '.repeat(20 - k) + ']';
      if (k < 20) later(tick, 28);
      else {
        const r = BF.secrets.execute(raw);
        btn.disabled = false;
        inp.value = '';
        if (!r.ok) { line('ERROR: ' + r.error, 'err'); BF.sfx.play('error'); inp.focus(); return; }
        line('FORGECORE TRANSACTION COMPLETE', 'ok big');
        line('+' + U.fmt(r.amount) + ' FORGECOINS CREDITED', 'ok');
        line('BALANCE: ' + U.fmt(r.balance) + ' FC', 'dim');
        line('');
        line('ENTER FORGECOIN AMOUNT', 'prompt');
        BF.sfx.play('secret', { volume: 0.7 });
        el.classList.remove('surge');
        void el.offsetWidth;
        el.classList.add('surge');
        inp.focus();
      }
    };
    later(tick, 60);
  }

  const forgecore = (BF.forgecore = {
    /** Open the terminal (only once the core is unlocked). */
    open() {
      if (el || !BF.secrets.isUnlocked()) return false;
      el = document.createElement('div');
      el.className = 'fc-scrim';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', 'Forgecore terminal');
      el.innerHTML = '<div class="fc-term"><div class="fc-bar"><span class="fc-dot"></span><b>FORGECORE</b><span class="fc-sub">core://ashcombe/cellar</span><button class="fc-close" aria-label="Close terminal">EXIT</button></div>' +
        '<div class="fc-out" aria-live="polite"></div>' +
        '<form class="fc-form" hidden autocomplete="off"><label for="fc-amount" class="fc-caret">&gt;</label><input id="fc-amount" inputmode="numeric" maxlength="22" spellcheck="false" aria-label="ForgeCoin amount"><button class="fc-exec" type="submit">EXECUTE</button></form>' +
        '<div class="fc-foot">LOCAL CORE · FICTIONAL FORGECOINS ONLY · NOTHING HERE LEAVES THIS DEVICE</div></div>';
      document.body.appendChild(el);
      requestAnimationFrame(() => el && el.classList.add('open'));
      el.querySelector('.fc-close').addEventListener('click', forgecore.close);
      el.querySelector('.fc-form').addEventListener('submit', (e) => { e.preventDefault(); execute(); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); forgecore.close(); } });
      el.addEventListener('click', (e) => { if (e.target === el) forgecore.close(); });
      BF.sfx.play('secret', { volume: 0.5 });
      boot();
      return true;
    },
    close() {
      timers.forEach(clearTimeout);
      timers = [];
      if (!el) return;
      const node = el;
      el = null;
      node.classList.remove('open');
      setTimeout(() => node.remove(), 220);
    },
    isOpen() { return !!el; },
  });

  // typing "forgecore" anywhere (outside text fields) re-opens the terminal once unlocked
  let buf = '';
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    if (!e.key || e.key.length !== 1) return;
    buf = (buf + e.key.toLowerCase()).slice(-9);
    if (buf === 'forgecore' && BF.secrets && BF.secrets.isUnlocked()) { buf = ''; forgecore.open(); }
  });
})((window.BF = window.BF || {}));
