async () => {
  // Listing probe: every SKU's real price and delivery promise. Pass the whole file as
  // the `function` of browser_evaluate / javascript_tool on an /item/<id>.html page.
  // Verified live 2026-10-26 (EN/USD, IL ship-to, signed in).
  //
  // Read-only. Clicking a SKU tile only changes the selection on the page; it does not
  // touch the cart. Each SKU in each `[data-sku-row]` is clicked in turn (a one-axis
  // sweep: other rows stay on their current choice) and read after the price settles.
  //
  // Delivery: the `.dynamic-shipping` block holds `Delivery: Nov 02 - 07`
  // (HE: `מסירה: נובמבר 02 - 07`). The `Fast delivery` / `אספקה מהירה` badge sits in the
  // "AliExpress commitment" block next to it, not inside `.dynamic-shipping`.
  // days_min/days_max are counted from the browser's today.
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 30 && !document.querySelector('.dynamic-shipping'); i++) await sleep(500);
  const body = () => document.body.innerText;
  if (/not a robot|captcha/i.test(body())) return { error: 'captcha', url: location.href };

  const MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    'ינואר': 0, 'פברואר': 1, 'מרץ': 2, 'אפריל': 3, 'מאי': 4, 'יוני': 5, 'יולי': 6, 'אוגוסט': 7,
    'ספטמבר': 8, 'אוקטובר': 9, 'נובמבר': 10, 'דצמבר': 11,
  };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const toDate = (m, d) => {
    const dt = new Date(today.getFullYear(), m, d);
    if (dt < today - 30 * 864e5) dt.setFullYear(dt.getFullYear() + 1); // Dec → Jan wrap
    return dt;
  };
  const days = dt => Math.round((dt - today) / 864e5);
  // "Nov 02 - 07" | "Nov 28 - Dec 03" | "Nov 05" | "נובמבר 02 - 07"
  const parseDelivery = s => {
    if (!s) return { days_min: null, days_max: null };
    const re = /([A-Za-z]{3,}|[֐-׿]+)\.?\s*(\d{1,2})(?:\s*[-–]\s*(?:([A-Za-z]{3,}|[֐-׿]+)\.?\s*)?(\d{1,2}))?/;
    const m = s.match(re);
    if (!m) return { days_min: null, days_max: null };
    const m1 = MONTHS[m[1].toLowerCase().slice(0, /[a-z]/i.test(m[1]) ? 3 : undefined)];
    if (m1 === undefined) return { days_min: null, days_max: null };
    const m2 = m[3] ? MONTHS[m[3].toLowerCase().slice(0, /[a-z]/i.test(m[3]) ? 3 : undefined)] : m1;
    const a = toDate(m1, +m[2]);
    const b = m[4] ? toDate(m2 ?? m1, +m[4]) : a;
    return { days_min: days(a), days_max: days(b) };
  };

  const price = () => document.querySelector('[class*="price-default--current--"]')?.textContent.trim() ?? null;
  const read = () => {
    const t = body();
    const delivery = (t.match(/(?:Delivery|מסירה):\s*([^\n]+)/) || [])[1]?.trim() ?? null;
    return {
      price: price(),
      orig: document.querySelector('[class*="price-default--original--"]')?.textContent.trim() ?? null,
      delivery,
      ...parseDelivery(delivery),
      fast: /\n\s*(Fast delivery|אספקה מהירה)\s*\n/.test(t),
      ship: document.querySelector('.dynamic-shipping')?.innerText.replace(/\s*\n\s*/g, ' | ').trim() ?? null,
      stock: (t.match(/(\d[\d,]*)\s*(?:available|זמינים|יחידות זמינות)/) || [])[1] ?? null,
    };
  };

  const rows = [...document.querySelectorAll('[data-sku-row]')];
  const skus = [];
  if (!rows.length) skus.push({ name: '(single SKU)', ...read() });
  for (const row of rows) {
    const axis = row.closest('[class*="sku-item--property--"]')
      ?.querySelector('[class*="sku-item--title--"]')?.textContent.split(':')[0].trim() ?? null;
    for (const opt of row.querySelectorAll('[data-sku-col]')) {
      const name = opt.getAttribute('title') || opt.querySelector('img')?.alt || opt.textContent.trim();
      if (/disabled|soldOut/i.test(opt.className)) {
        skus.push({ axis, name, col: opt.dataset.skuCol, disabled: true });
        continue;
      }
      const before = price();
      opt.click();
      for (let i = 0; i < 6; i++) { await sleep(400); if (price() !== before) break; }
      await sleep(600);
      skus.push({ axis, name, col: opt.dataset.skuCol, ...read() });
    }
  }

  const t = body();
  return {
    id: location.pathname.match(/item\/(\d+)/)?.[1],
    url: `https://www.aliexpress.com/item/${location.pathname.match(/item\/(\d+)/)?.[1]}.html`,
    title: document.title.replace(/ - AliExpress.*$/, '').slice(0, 160),
    currency_glyph: (t.match(/₪|US ?\$/) || [null])[0],
    store: (t.match(/(?:Sold By|נמכר על ידי)\s*\n([^\n]+)/) || [])[1] ?? null,
    rating: (t.match(/\n\s*(\d\.\d)\s*\n\s*([\d,]+) (?:Reviews|ביקורות)/) || [])[1] ?? null,
    reviews: (t.match(/\n\s*(\d\.\d)\s*\n\s*([\d,]+) (?:Reviews|ביקורות)/) || [])[2] ?? null,
    sold: (t.match(/([\d,]+\+?) (?:sold|נמכרו)/) || [])[1] ?? null,
    choice: !!document.querySelector('img[alt="Choice"], [class*="choice"]'),
    probed_at: new Date().toISOString(),
    skus,
  };
}
