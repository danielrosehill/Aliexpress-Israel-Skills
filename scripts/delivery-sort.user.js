// ==UserScript==
// @name         AliExpress — Delivery estimate on cards (sort fastest first)
// @namespace    aliexpress-israel-skills
// @version      1.0.0
// @description  Shows each search card's delivery estimate to your ship-to country (e.g. "~9 d · 7–12"), colours it by tier (≤10 d / ≤30 d / slower), and adds a "Sort by delivery" switch that puts the fastest first.
// @match        https://*.aliexpress.com/w/*
// @match        https://*.aliexpress.com/wholesale*
// @match        https://*.aliexpress.com/category/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/danielrosehill/Aliexpress-Israel-Skills/master/scripts/delivery-sort.user.js
// @downloadURL  https://raw.githubusercontent.com/danielrosehill/Aliexpress-Israel-Skills/master/scripts/delivery-sort.user.js
// ==/UserScript==

(function () {
  'use strict';

  // Tiers on the midpoint of the promised window, in days from today.
  // Live 2026-10-26, IL: "AliExpress Selection Standard" 7–12 / 7–14 (≈9–10, the fast
  // lane); "AliExpress standard shipping" 11–20 (≈15).
  const FAST_DAYS = 10;
  const OK_DAYS = 30;
  const COLORS = { fast: '#1e8e3e', ok: '#e37400', slow: '#c5221f', none: '#757575' };
  const CONCURRENCY = 3;
  const CACHE_KEY = 'delivery-sort:cache';
  const CACHE_TTL = 6 * 3600 * 1000;
  const SORT_KEY = 'delivery-sort:on';

  const CELL = '.search-item-card-wrapper-gallery';

  if (typeof GM_info !== 'undefined') {
    document.documentElement.setAttribute('data-us-delivery-sort', GM_info.script.version);
  }

  // Not the page's own ship-to: read it from the locale cookie (region=IL).
  const cookie = document.cookie;
  const region = (cookie.match(/region=([A-Z]{2})/) || [])[1] || 'IL';
  const currency = (cookie.match(/c_tp=([A-Z]{3})/) || [])[1] || 'USD';

  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { cache = {}; }
  const now = Date.now();
  for (const k of Object.keys(cache)) if (now - cache[k].at > CACHE_TTL) delete cache[k];
  const saveCache = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {} };

  // The listing page's own data API returns deliveryDayMin/Max per item; the first
  // pair is the option the listing displays (verified against "Delivery: Nov 03 - 08"
  // = 7–12 on 1005007345086449, 2026-10-26). Signed by lib.mtop with the session token.
  async function fetchEta(id) {
    const key = `${region}:${id}`;
    if (cache[key]) return cache[key];
    const r = await window.lib.mtop.request({
      api: 'mtop.aliexpress.pdp.pc.query', v: '1.0', type: 'GET', dataType: 'originaljsonp', timeout: 15000,
      data: {
        productId: id, _lang: 'en_US', _currency: currency, country: region, province: '', city: '',
        channel: '', pdp_ext_f: '', pdpNPI: '', sourceType: '', clientType: 'pc',
        ext: JSON.stringify({ crawler: false, signedIn: true, host: location.host }),
      },
    });
    const s = JSON.stringify(r);
    const min = +(s.match(/deliveryDayMin\\*":(\d+)/) || [])[1];
    const max = +(s.match(/deliveryDayMax\\*":(\d+)/) || [])[1];
    const company = (s.match(/company\\*":\\*"([^"\\]+)/) || [])[1] || '';
    const eta = { min: min || null, max: max || null, company, at: Date.now() };
    cache[key] = eta;
    saveCache();
    return eta;
  }

  const tier = eta => {
    if (!eta || !eta.min || !eta.max) return 'none';
    const mid = (eta.min + eta.max) / 2;
    return mid <= FAST_DAYS ? 'fast' : mid <= OK_DAYS ? 'ok' : 'slow';
  };

  // ---------- cards ----------

  const seen = new WeakSet();
  const queue = [];
  let running = 0;
  let sortOn = localStorage.getItem(SORT_KEY) === '1';

  const idOf = cell => {
    const a = cell.querySelector('a[href*="/item/"], a[href*="productIds="]');
    return a && (a.href.match(/(?:item\/|productIds=)(\d+)/) || [])[1];
  };

  function label(cell, eta, state) {
    let tag = cell.querySelector('.ds-eta');
    if (!tag) {
      tag = document.createElement('div');
      tag.className = 'ds-eta';
      Object.assign(tag.style, {
        position: 'absolute', left: '6px', top: '6px', zIndex: 5, padding: '2px 7px', borderRadius: '6px',
        font: '600 12px/1.4 -apple-system, "Segoe UI", sans-serif', color: '#fff', pointerEvents: 'none',
      });
      if (getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
      cell.appendChild(tag);
    }
    if (state === 'loading') { tag.textContent = '… d'; tag.style.background = COLORS.none; return; }
    const t = tier(eta);
    tag.style.background = COLORS[t];
    tag.textContent = t === 'none' ? 'no ETA' : `~${Math.round((eta.min + eta.max) / 2)} d · ${eta.min}–${eta.max}`;
    tag.title = eta && eta.company ? eta.company : '';
    cell.style.outline = t === 'fast' ? `2px solid ${COLORS.fast}` : '';
    cell.dataset.etaMid = t === 'none' ? '999' : String(Math.round((eta.min + eta.max) / 2 * 10));
    applySort();
  }

  function pump() {
    while (running < CONCURRENCY && queue.length) {
      const { cell, id } = queue.shift();
      running++;
      fetchEta(id)
        .then(eta => label(cell, eta))
        .catch(() => label(cell, null))
        .finally(() => { running--; updateBar(); pump(); });
    }
    updateBar();
  }

  function scan() {
    if (!(window.lib && window.lib.mtop && window.lib.mtop.request)) return;
    for (const cell of document.querySelectorAll(CELL)) {
      if (seen.has(cell)) continue;
      const id = idOf(cell);
      if (!id) continue;
      seen.add(cell);
      const cached = cache[`${region}:${id}`];
      if (cached) { label(cell, cached); continue; }
      label(cell, null, 'loading');
      queue.push({ cell, id });
    }
    pump();
  }

  // CSS order only: the grid (#card-list) is a wrapping flex box with the cells as
  // direct children, so this reorders visually without touching AliExpress's own DOM.
  function applySort() {
    for (const cell of document.querySelectorAll(CELL)) {
      cell.style.order = sortOn && cell.dataset.etaMid ? cell.dataset.etaMid : '';
    }
  }

  // ---------- bar ----------

  let bar, stats, box;
  function buildBar() {
    if (bar) return;
    bar = document.createElement('div');
    bar.id = 'delivery-sort-bar';
    Object.assign(bar.style, {
      background: 'rgba(20,20,20,0.92)', color: '#fff', font: '13px/1.3 -apple-system, "Segoe UI", sans-serif',
      padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px',
      margin: '12px 0', width: 'fit-content',
    });
    const lab = document.createElement('label');
    Object.assign(lab.style, { display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: '600', cursor: 'pointer' });
    box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = sortOn;
    box.addEventListener('change', () => {
      sortOn = box.checked;
      localStorage.setItem(SORT_KEY, sortOn ? '1' : '0');
      applySort();
    });
    lab.append(box, document.createTextNode('Sort by delivery'));
    stats = document.createElement('span');
    bar.append(lab, stats);
    const grid = document.querySelector('#card-list');
    if (grid && grid.parentElement) grid.parentElement.insertBefore(bar, grid);
    else document.body.insertBefore(bar, document.body.firstChild);
  }

  function updateBar() {
    if (!bar) buildBar();
    const counts = { fast: 0, ok: 0, slow: 0, none: 0 };
    for (const cell of document.querySelectorAll(CELL)) {
      const m = cell.dataset.etaMid;
      if (!m) continue;
      const mid = +m / 10;
      counts[m === '999' ? 'none' : mid <= FAST_DAYS ? 'fast' : mid <= OK_DAYS ? 'ok' : 'slow']++;
    }
    const pending = queue.length + running;
    stats.innerHTML =
      `<span style="color:#81c995">≤${FAST_DAYS} d: ${counts.fast}</span> · ` +
      `<span style="color:#fdd663">≤${OK_DAYS} d: ${counts.ok}</span> · ` +
      `<span style="color:#f28b82">slower: ${counts.slow}</span>` +
      (counts.none ? ` · no ETA: ${counts.none}` : '') +
      (pending ? ` · checking ${pending}…` : '');
  }

  // ---------- boot ----------

  buildBar();
  scan();
  // lib.mtop can arrive after document-idle.
  let tries = 0;
  const wait = setInterval(() => { scan(); if (window.lib && window.lib.mtop || ++tries > 20) clearInterval(wait); }, 500);
  const obs = new MutationObserver(() => {
    clearTimeout(obs._t);
    obs._t = setTimeout(scan, 200);
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();
