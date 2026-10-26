async () => {
  // Search-results card extractor. Pass the whole file as the `function` of
  // browser_evaluate / javascript_tool on a /w/wholesale-… page. Verified live
  // 2026-10-26 (EN/USD and HE/ILS, IL ship-to).
  //
  // - Scrolls until the card count stops rising (results hydrate in stages).
  // - Reads `.search-item-card-wrapper-gallery` cards via leaf textContent
  //   (card innerText can come back empty even on a rendered page).
  // - Flags bundle cards: their link is /ssr/300000512/BundleDeals2?productIds=<id>:<sku>
  //   instead of /item/<id>.html. The price on a bundle card is not a one-item price.
  // - Skips the brand-store strip (`storeDirect--productCard`), which carries a price only.
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let n = 0;
  for (let i = 0; i < 25; i++) {
    window.scrollBy(0, 1000);
    await sleep(800);
    const c = document.querySelectorAll('.search-item-card-wrapper-gallery').length;
    if (i > 6 && c === n) break;
    n = c;
  }
  window.scrollTo(0, 0);
  const priceRe = /(?:US ?\$ ?|₪ ?)[\d,]+(?:\.\d+)?/;
  const cards = [];
  for (const c of document.querySelectorAll('.search-item-card-wrapper-gallery')) {
    const links = [...c.querySelectorAll('a[href]')].map(a => a.href);
    const item = links.find(h => /\/item\/\d+/.test(h));
    const bundleUrl = links.find(h => /BundleDeals/i.test(h));
    const id = (item || bundleUrl || '').match(/(?:item\/|productIds=)(\d+)/)?.[1];
    if (!id) continue;
    const leaves = [...c.querySelectorAll('*')]
      .filter(e => !e.children.length)
      .map(e => e.textContent.trim())
      .filter(Boolean);
    const text = leaves.join(' | ');
    cards.push({
      id,
      bundle: !!bundleUrl,
      url: bundleUrl ? bundleUrl.split('&pha')[0] : `https://www.aliexpress.com/item/${id}.html`,
      title: (leaves.find(l => l.length > 25) || '').slice(0, 160),
      card_price: (text.match(priceRe) || [null])[0],
      rating: (leaves.find(l => /^\d\.\d$/.test(l)) || null),
      sold: (text.match(/([\d.,]+\+?) (?:sold|נמכרו)/) || [])[1] || null,
      ad: /\| (?:Ad|מודעה)(?: \||$)/.test(text),
      shipping_tag: leaves.find(l => /Free shipping|משלוח חינם/.test(l)) || null,
    });
  }
  const seen = new Set();
  const unique = cards.filter(c => !seen.has(c.id) && seen.add(c.id));
  return {
    url: location.href,
    currency_glyph: (document.body.innerText.match(/₪|US ?\$/) || [null])[0],
    lang: document.documentElement.lang,
    switches: [...document.querySelectorAll('[aria-label^="filterCode:"]')]
      .map(e => `${e.getAttribute('aria-label').slice(11)}=${e.getAttribute('aria-checked')}`),
    count: unique.length,
    cards: unique,
  };
}
