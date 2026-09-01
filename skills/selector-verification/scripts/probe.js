/**
 * AliExpress selector probe — plugin maintenance, not shopping.
 *
 * Paste into mcp__claude-in-chrome__javascript_tool (or browser_evaluate) on
 * either a search results page or a product page. Detects which it is and runs
 * the applicable checks.
 *
 * Returns JSON: { page, session, checks: [{id, selector, status, count, note}] }
 * status: "PASS" (found, usable) | "FAIL" (documented selector finds nothing)
 *         | "N/A" (not applicable to this page)
 *
 * A FAIL means reference/selectors.md is stale for that entry. Never "fix" it by
 * loosening the selector until it matches something — find what the page actually
 * uses and record that.
 */
(async () => {
  const out = [];

  // --- hydration gate --------------------------------------------------
  // AliExpress hydrates in stages over ~10s. Probing early reports failures that
  // are not real: measured 4 cards / 0 chips early vs 13 / 4 settled, same page.
  // Never emit a FAIL from an unsettled page.
  const settle = async () => {
    let prev = -1, n = 0;
    for (let i = 0; i < 20; i++) {
      n = document.querySelectorAll('a[href*="/item/"]').length;
      if (n === prev && n > 0) return n;
      prev = n;
      await new Promise(r => setTimeout(r, 1000));
    }
    return n;
  };
  const cardCount = await settle();
  const isSearchPage = /\/w\/|\/wholesale|\/af\/|SearchText=/.test(location.href);
  if (isSearchPage && cardCount < 10) {
    return {
      probedAt: new Date().toISOString(),
      verdict: 'INCONCLUSIVE — page did not render',
      cardCount,
      note: 'A broad fixture query must yield >=10 cards. Fewer means the grid never '
          + 'hydrated (or a bot challenge). Reload and re-run; do NOT record FAILs from this run.',
    };
  }
  const add = (id, selector, status, count, note) =>
    out.push({ id, selector, status, count, note: note ?? null });

  const q = (sel, root = document) => { try { return [...root.querySelectorAll(sel)]; } catch { return []; } };
  const check = (id, sel, note) => {
    const n = q(sel).length;
    add(id, sel, n > 0 ? 'PASS' : 'FAIL', n, note);
    return n;
  };

  // ---- session / locale -------------------------------------------------
  const bodyText = document.body.innerText || '';
  const switcher = [...document.querySelectorAll('[aria-label]')]
    .find(e => /country, region or language|shipping to/i.test(e.getAttribute('aria-label') || ''));
  const session = {
    url: location.href,
    host: location.host,
    htmlLang: document.documentElement.lang || null,
    htmlDir: document.documentElement.dir || null,
    switcherText: (switcher?.innerText || '').replace(/\s+/g, ' ').trim() || null,
    shekelPresent: /₪/.test(bodyText),
    usdPresent: /US\s?\$/.test(bodyText) ||
      [...document.querySelectorAll('[aria-label]')].some(e => /^US\s?\$/.test(e.getAttribute('aria-label'))),
    // aep_usuc_f is HttpOnly — never readable here. Absence proves nothing.
    cookieReadable: /aep_usuc_f/.test(document.cookie),
  };
  session.localeVerdict =
    session.shekelPresent && !session.usdPresent ? 'ILS — handshake held'
    : session.usdPresent ? 'USD — HANDSHAKE DID NOT HOLD'
    : 'indeterminate (page may not have hydrated)';

  const isSearch = /\/w\/|\/wholesale|\/af\/|SearchText=/.test(location.href);
  const isProduct = /\/item\/\d+/.test(location.href);
  const page = isProduct ? 'product' : isSearch ? 'search' : 'other';

  // ---- search results page ---------------------------------------------
  if (isSearch) {
    ['freeshipping', 'choice_atm', '4StarRating', 'PremiumQuality'].forEach(code =>
      check(`filter-chip:${code}`, `[aria-label="filterCode:${code}"]`,
        'documented V — click wrapper span, assert aria-checked'));

    add('filter-chip:any', '[aria-label^="filterCode:"]',
      q('[aria-label^="filterCode:"]').length ? 'PASS' : 'FAIL',
      q('[aria-label^="filterCode:"]').length,
      'if 0, the whole documented filter row is absent from this layout');

    add('filter-row:fallback', 'input[type=checkbox] | [aria-checked]',
      (q('input[type=checkbox]').length + q('[aria-checked]').length) ? 'PASS' : 'FAIL',
      q('input[type=checkbox]').length + q('[aria-checked]').length,
      'any filter-like control at all, by any anchor');

    check('ship-from:IL', '[aria-label="IL"]', 'documented V — ship-from radio group');

    const cards = q('a[href*="/item/"]');
    add('card:link', 'a[href*="/item/"]', cards.length ? 'PASS' : 'FAIL', cards.length,
      'item links — the de-dupe anchor');

    const withPriceClass = cards.filter(a => q('[class*="price"]', a).length).length;
    add('card:price-by-class', 'a[href*="/item/"] [class*="price"]',
      withPriceClass ? 'PASS' : 'FAIL', withPriceClass,
      'KNOWN BROKEN as of 2026-09-01 — expected FAIL. Price lives in hashed spans.');

    const withPriceText = cards.filter(a => /(?:US ?\$|₪)\s?[\d,]+/.test(a.innerText || '')).length;
    add('card:price-by-innertext', 'regex over card.innerText',
      withPriceText ? 'PASS' : 'FAIL', withPriceText,
      'CURRENT documented extraction — this is the one that must pass');

    const withTitleClass = cards.filter(a => q('[class*="title"], h3, [title]', a).length).length;
    add('card:title-by-class', 'a[href*="/item/"] [class*="title"], h3, [title]',
      withTitleClass ? 'PASS' : 'FAIL', withTitleClass,
      'documented V card title selector');

    const priceLabels = q('[aria-label^="US $"], [aria-label^="₪"]');
    add('card:price-by-aria', '[aria-label^="US $"] | [aria-label^="₪"]',
      priceLabels.length ? 'PASS' : 'FAIL', priceLabels.length,
      'ALTERNATE extraction path — price exposed as aria-label');

    const emptyText = cards.filter(a => !(a.innerText || '').trim()).length;
    add('card:innerText', 'a[href*="/item/"] .innerText',
      emptyText === cards.length && cards.length ? 'FAIL' : 'PASS',
      cards.length - emptyText,
      `${emptyText}/${cards.length} cards render no text — text may live only in aria-label`);
  } else {
    ['filter-chip:any', 'ship-from:IL', 'card:link'].forEach(id => add(id, '-', 'N/A', 0, 'not a search page'));
  }

  // ---- product page -----------------------------------------------------
  if (isProduct) {
    check('review:section', '[class*="title--wrap--"]', 'documented V — reviews header');
    const ilFlag = q('[class*="country-flag-"].IL');
    add('review:il-chip', '[class*="country-flag-"].IL', ilFlag.length ? 'PASS' : 'FAIL', ilFlag.length,
      'documented V — 0 can legitimately mean no IL reviews exist; re-test on a listing that has some');
    check('review:chip-wrapper', '[class*="filter--filterItem--"]', 'documented V');
    check('review:item-box', '[class*="list--itemBox--"]', 'documented V — may need scroll to reviews');
    check('review:view-more', '[class*="v3--btn--"]', 'documented V');

    // delivery panel — status U in reference/selectors.md
    check('ship:dynamic-shipping', '[class*="dynamic-shipping"]', 'candidate U');
    const shipTextRow = [...document.querySelectorAll('div,button,a')]
      .filter(el => /^(משלוח|Shipping|אספקה|Delivery|Free shipping)/i.test((el.textContent || '').trim()))
      .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
    add('ship:text-anchor', 'text /^(Shipping|Delivery|משלוח)/', shipTextRow ? 'PASS' : 'FAIL',
      shipTextRow ? 1 : 0,
      shipTextRow ? `matched <${shipTextRow.tagName.toLowerCase()} class="${String(shipTextRow.className).slice(0, 40)}">` : 'no shipping row found by text');
    check('ship:modal', '[class*="comet-v2-modal"]', 'candidate U — options modal, only after opening the row');

    // spec table — status U
    const specs = q('[class*="specification"] li, [class*="spec"] li');
    add('spec:list', '[class*="specification"] li, [class*="spec"] li',
      specs.length ? 'PASS' : 'FAIL', specs.length, 'candidate U');
    const specText = /Plug|Voltage|Frequency|תקע|מתח|\b\d{2,3}\s?V\b|\bHz\b/.test(bodyText);
    add('spec:text-fallback', 'regex over body.innerText', specText ? 'PASS' : 'FAIL', specText ? 1 : 0,
      'fallback for check-il-compatibility; may need the spec table expanded first');

    // variant grid
    check('variant:sku-grid', '[class*="sku-item"], [class*="skuItem"], [data-sku-col]', 'candidate U');
  } else {
    ['review:il-chip', 'ship:text-anchor', 'spec:list'].forEach(id => add(id, '-', 'N/A', 0, 'not a product page'));
  }

  const fails = out.filter(c => c.status === 'FAIL');
  return {
    probedAt: new Date().toISOString(),
    verdict: 'CONCLUSIVE — page settled at ' + cardCount + ' cards',
    page, session,
    summary: {
      pass: out.filter(c => c.status === 'PASS').length,
      fail: fails.length,
      na: out.filter(c => c.status === 'N/A').length,
      failedIds: fails.map(c => c.id),
    },
    checks: out,
  };
})()
