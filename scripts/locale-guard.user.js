// ==UserScript==
// @name         AliExpress locale guard
// @namespace    aliexpress-israel-skills
// @version      1.1.0
// @description  Keeps AliExpress on your chosen language / currency / ship-to. When the site drifts (e.g. back to Hebrew/ILS), rewrites the locale cookies and reloads once.
// @match        *://*.aliexpress.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/danielrosehill/Aliexpress-Israel-Skills/main/scripts/locale-guard.user.js
// @downloadURL  https://raw.githubusercontent.com/danielrosehill/Aliexpress-Israel-Skills/main/scripts/locale-guard.user.js
// ==/UserScript==

(function () {
  'use strict';

  // Version stamp, read by the update-userscripts skill.
  if (typeof GM_info !== 'undefined') {
    document.documentElement.setAttribute('data-us-locale-guard', GM_info.script.version);
  }

  // ---- Your preference. Presets: EN/USD (default), EN/ILS, HE/USD, HE/ILS. ----
  const WANT = { locale: 'en_US', currency: 'USD', region: 'IL' };
  // HE: locale 'iw_IL'.   ILS: currency 'ILS'.

  // Mechanism (verified live 2026-10-26): the locale lives in two cookies on
  // .aliexpress.com that page JS can read and write:
  //   aep_usuc_f  … c_tp=<currency> … region=<CC> … b_locale=<locale> …
  //   xman_us_f   … x_locale=<locale> … intl_locale=<locale> …
  // Writing them and reloading switches the rendered language and currency.
  const DOMAIN = '.aliexpress.com';
  const LOOP_KEY = 'ae-locale-guard-last';

  const get = name =>
    document.cookie.split('; ').find(c => c.startsWith(name + '='))?.slice(name.length + 1);
  const set = (name, value) => {
    document.cookie = `${name}=${value}; domain=${DOMAIN}; path=/; max-age=31536000; SameSite=None; Secure`;
  };
  const sub = (s, key, val) =>
    new RegExp(`(^|&)${key}=`).test(s) ? s.replace(new RegExp(`(^|&)${key}=[^&]*`), `$1${key}=${val}`) : `${s}&${key}=${val}`;

  const usuc = get('aep_usuc_f');
  const xman = get('xman_us_f');
  if (!usuc) return; // first visit: let the site write its cookies, check on the next load

  const has = (s, key, val) => s && new RegExp(`(^|&)${key}=${val}(&|$)`).test(s);
  const ok =
    has(usuc, 'c_tp', WANT.currency) &&
    has(usuc, 'b_locale', WANT.locale) &&
    has(usuc, 'region', WANT.region) &&
    (!xman || has(xman, 'x_locale', WANT.locale));
  if (ok) return;

  // Never loop: at most one corrective reload per 30 s per tab.
  const last = +sessionStorage.getItem(LOOP_KEY) || 0;
  if (Date.now() - last < 30000) {
    console.warn('[locale-guard] drift persists after a reload; the site may be overriding cookies server-side.');
    return;
  }
  sessionStorage.setItem(LOOP_KEY, String(Date.now()));

  let u = sub(usuc, 'c_tp', WANT.currency);
  u = sub(u, 'b_locale', WANT.locale);
  u = sub(u, 'region', WANT.region);
  set('aep_usuc_f', u);
  if (xman) {
    let x = sub(xman, 'x_locale', WANT.locale);
    x = sub(x, 'intl_locale', WANT.locale);
    set('xman_us_f', x);
  }
  console.info('[locale-guard] corrected locale to', WANT, '— reloading');
  location.reload();
})();
