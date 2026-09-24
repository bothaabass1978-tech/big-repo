/**
 * BlockForge — hash router and page lifecycle.
 * Pages register with BF.pages.register(name, {title, nav, watch, render, mount, unmount}).
 * A page re-renders (keeping scroll and focus) when a watched store slice changes.
 */
(function (BF) {
  'use strict';

  const pages = {};
  const routes = [];
  let current = null;
  let memHash = '#/home';
  let useMem = false;
  let rerenderQueued = false;
  let loadingTimer = null;

  BF.pages = {
    register(name, def) {
      pages[name] = Object.assign({ name, watch: [] }, def);
      return pages[name];
    },
    get(name) {
      return pages[name];
    },
  };

  /** Compile '/game/:id/:tab?' into a regex; keys keep path order. */
  function compile(pattern) {
    const keys = [];
    let src = '';
    for (const part of pattern.split('/').filter(Boolean)) {
      if (part[0] === ':') {
        const optional = part.endsWith('?');
        keys.push(part.slice(1, optional ? -1 : undefined));
        src += optional ? '(?:\\/([^\\/]+))?' : '\\/([^\\/]+)';
      } else {
        src += '\\/' + part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
    }
    return { re: new RegExp('^' + (src || '\\/') + '\\/?$'), keys };
  }

  function parse(hash) {
    let h = String(hash || '').replace(/^#/, '');
    if (!h || h === '/') h = '/home';
    const qi = h.indexOf('?');
    const path = qi >= 0 ? h.slice(0, qi) : h;
    const query = {};
    if (qi >= 0) {
      for (const part of h.slice(qi + 1).split('&')) {
        if (!part) continue;
        const [k, v] = part.split('=');
        query[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
      }
    }
    return { path, query };
  }

  function currentHash() {
    if (useMem) return memHash;
    try {
      return window.location.hash || memHash;
    } catch (e) {
      return memHash;
    }
  }

  const router = (BF.router = {
    /** Map a path pattern like '/game/:id/:tab?' to a page. */
    add(pattern, page) {
      const c = compile(pattern);
      routes.push({ pattern, re: c.re, keys: c.keys, page });
    },

    current() {
      return current;
    },

    /** Navigate to a hash route (e.g. '#/shop?tab=hats'). */
    go(hash, opts) {
      if (!hash) return;
      if (hash[0] !== '#') hash = '#' + hash;
      memHash = hash;
      try {
        if (window.location.hash === hash) { useMem = false; router.handle(); return; }
        if (opts && opts.replace && history.replaceState) {
          history.replaceState(null, '', hash);
          useMem = window.location.hash !== hash;
          router.handle();
          return;
        }
        window.location.hash = hash;
        if (window.location.hash !== hash) { useMem = true; router.handle(); }
      } catch (e) {
        useMem = true;
        router.handle();
      }
    },

    /** Build a hash with query parameters. */
    link(path, query) {
      const q = Object.entries(query || {}).filter(([, v]) => v != null && v !== '' && v !== false).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
      return '#' + path + (q ? '?' + q : '');
    },

    start() {
      window.addEventListener('hashchange', () => {
        useMem = false;
        try { memHash = window.location.hash || memHash; } catch (e) { /* sandboxed */ }
        router.handle();
      });
      router.handle();
    },

    /** Resolve the current hash and render its page. */
    handle() {
      if (!BF.store.state) return;
      const hash = currentHash();
      const { path, query } = parse(hash);
      let match = null;
      for (const r of routes) {
        const m = r.re.exec(path);
        if (m) {
          const params = {};
          r.keys.forEach((k, i) => { params[k] = m[i + 1] ? decodeURIComponent(m[i + 1]) : undefined; });
          match = { page: pages[r.page], params };
          break;
        }
      }
      if (!match) match = { page: pages.notfound, params: {} };
      const samePage = current && current.page === match.page;
      render(match.page, match.params, query, { transition: !samePage, samePage, hash });
    },

    /** Re-render the current page in place (keeps scroll and focus). */
    refresh() {
      if (!current || rerenderQueued) return;
      rerenderQueued = true;
      requestAnimationFrame(() => {
        rerenderQueued = false;
        if (!current) return;
        const active = document.activeElement;
        const focusId = active && active.id;
        let sel = null;
        try { if (focusId && active.selectionStart != null) sel = [active.selectionStart, active.selectionEnd]; } catch (e) { sel = null; }
        render(current.page, current.params, current.query, { transition: false, samePage: true, keepScroll: true, hash: current.hash });
        if (focusId) {
          const el = document.getElementById(focusId);
          if (el && el !== document.activeElement) {
            el.focus({ preventScroll: true });
            try { if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text input */ }
          }
        }
      });
    },
  });

  function render(page, params, query, opts) {
    const main = document.getElementById('main');
    if (!main || !page) return;
    const prevScroll = main.scrollTop;
    if (current && current.page.unmount) {
      try { current.page.unmount(); } catch (e) { console.error(e); }
    }
    clearTimeout(loadingTimer);
    current = { page, params, query, hash: opts.hash };
    const doRender = () => {
      let html;
      try {
        html = page.render(params, query);
      } catch (e) {
        console.error('[BF.router] render failed for', page.name, e);
        html = BF.ui.empty({ icon: 'warning', title: 'This page hit a snag', text: String(e && e.message ? e.message : e), action: { label: 'Go home', href: '#/home' } });
      }
      main.innerHTML = '<div class="page' + (opts.transition ? ' page-enter' : '') + '" data-page="' + page.name + '">' + html + '</div>';
      if (page.mount) {
        try { page.mount(main.firstElementChild, params, query); } catch (e) { console.error(e); }
      }
      main.scrollTop = opts.keepScroll || (opts.samePage && page.keepScrollOnParams) ? prevScroll : 0;
    };
    if (opts.transition && page.loading && !BF.ui.skipLoading) {
      main.innerHTML = '<div class="page" data-page="' + page.name + '-loading">' + page.loading() + '</div>';
      main.scrollTop = 0;
      loadingTimer = setTimeout(doRender, 240);
    } else {
      doRender();
    }
    const title = typeof page.title === 'function' ? page.title(params, query) : page.title;
    document.title = (title ? title + ' · ' : '') + 'BlockForge';
    if (BF.shell) BF.shell.setActive(page.nav || page.name);
  }

  // Re-render the active page when a watched slice changes.
  BF.bus.on('store:change', (keys) => {
    if (!current || !current.page.watch) return;
    const watch = typeof current.page.watch === 'function' ? current.page.watch(current.params, current.query) : current.page.watch;
    if (watch && watch.some((k) => keys.has(k))) router.refresh();
  });
})((window.BF = window.BF || {}));
