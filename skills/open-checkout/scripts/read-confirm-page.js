/**
 * Extract the committed order terms from an AliExpress order-confirmation page.
 *
 * Evaluate in the page via mcp__claude-in-chrome__javascript_tool, or
 * browser_evaluate under gateway Playwright. Returns the snapshot and also
 * parks it on window.aeConfirm.
 *
 *   Host: https://www.aliexpress.com/p/trade/confirm.html
 *
 * Read-only. Clicks nothing, fills nothing, submits nothing.
 *
 * Personal data is redacted at source, so the return value is safe to paste into
 * a repo or a transcript: no street address, no customs ID, no payment
 * instrument. What is kept is the *shape* — that a block is present, and the
 * city/country needed to sanity-check the destination.
 *
 * Selectors verified live 2026-09-03 and re-confirmed end to end 2026-09-04
 * (EN/USD, signed in, cart route; returned both summary blocks, 4 + 1 rows).
 * The durable anchor is `pl-order-toal-container` — an unhashed BEM block
 * carrying the summary rows. Note the typo is AliExpress's own ("toal"); do not
 * "fix" it. See reference/selectors.md and docs/admin/validated-explorations/.
 */
(() => {
  const txt = (el) => (el && (el.innerText || '') || '').replace(/\s+/g, ' ').trim();
  const one = (sel, root = document) => root.querySelector(sel);
  const all = (sel, root = document) => [...root.querySelectorAll(sel)];

  const MONEY = /(-?)\s?(US ?\$|₪|€|£)\s?([\d,]+\.?\d*)/;

  /** Parse "US $1.44" / "-US $3.43" into a signed number plus its currency. */
  function money(s) {
    const m = (s || '').match(MONEY);
    if (!m) return null;
    const [, sign, glyph, digits] = m;
    const value = parseFloat(digits.replace(/,/g, ''));
    if (!isFinite(value)) return null;
    return {
      value: sign === '-' ? -value : value,
      currency: /₪/.test(glyph) ? 'ILS' : /\$/.test(glyph) ? 'USD' : glyph.trim(),
      text: m[0].trim(),
      negative: sign === '-',
    };
  }

  /**
   * Summary rows live in TWO separate blocks — verified live 2026-09-03:
   *
   *   .pl-summary-container > .pl-summary__items
   *     .pl-summary__item-pc                     <- one per row
   *       .pl-summary__item-title-pc             <- label
   *       .pl-summary__item-content-wrapper      <- value
   *   ...holds Subtotal, Promo codes, Shipping fee, Bonus.
   *
   *   .pl-order-toal-container__item             <- the TOTAL only, by the button
   *     .pl-order-toal-container__item-title-wrap / __item-content
   *
   * The Total is NOT in the summary panel. Reading only one block is the trap:
   * anchoring on pl-order-toal-container alone yields a total with no subtotal
   * and no Bonus row, i.e. a $0.00 order with the credit invisible. Both
   * class names are unhashed BEM; the "toal" typo is AliExpress's own.
   *
   * The summary panel's first row is a HEADER ("Summary", empty value) and must
   * be dropped or it becomes a phantom row.
   */
  function summaryRows() {
    const read = (rowSel, labelSel, valueSel) =>
      all(rowSel)
        .map((el) => ({
          label: txt(one(labelSel, el)),
          value: txt(one(valueSel, el)),
        }))
        .filter((r) => r.label && r.value)          // drops the header row
        .map((r) => ({ ...r, amount: money(r.value) }));

    const panel = read(
      '[class*="pl-summary__item-pc"]',
      '[class*="pl-summary__item-title"]',
      '[class*="pl-summary__item-content"]'
    );
    const totalBlock = read(
      '[class*="pl-order-toal-container__item"]',
      '[class*="item-title-wrap"]',
      '[class*="item-content"]'
    );

    // De-dupe by label, panel first, so a Total appearing in both keeps one row.
    const seen = new Set();
    const rows = [...panel, ...totalBlock].filter((r) => {
      const k = r.label.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (rows.length) {
      return {
        rows,
        source: `pl-summary__item-pc (${panel.length}) + pl-order-toal-container__item (${totalBlock.length})`,
      };
    }

    // Fallback: label -> next line, over body text.
    const lines = (document.body.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const wanted = /^(subtotal|promo codes?|shipping fee|bonus|tax|vat|total|סה"?כ|משלוח|מע"?מ)\b/i;
    const out = [];
    lines.forEach((l, i) => {
      if (wanted.test(l)) out.push({ label: l, value: lines[i + 1] ?? '', amount: money(lines[i + 1]) });
    });
    return { rows: out, source: 'body-text fallback — blocks were renamed, re-verify selectors' };
  }

  /** Pick a row by label, tolerating case and trailing punctuation. */
  const row = (rows, re) => rows.find((r) => re.test(r.label)) ?? null;

  function items() {
    const blocks = all('[class*="group-product--wrapper--"]');
    return blocks.map((b) => {
      const ship = one('[class*="group-ship-options--wrapper--"]', b)
        || one('[class*="group-ship-options--wrapper--"]', b.parentElement || document);
      const qtyInput = one('input[class*="input-number-input"]', b)
        || one('input[class*="input-number-input"]', b.parentElement || document);
      return {
        block: txt(b).slice(0, 160),
        title: txt(one('[class*="group-product--title--"]', b)) || null,
        price: money(txt(b)),
        quantity: qtyInput ? qtyInput.value : null,
        shippingText: txt(one('[class*="group-ship-options--cost--"]', ship || document)) || null,
        deliveryText: txt(one('[class*="group-ship-options--desc--"]', ship || document)) || null,
      };
    });
  }

  /**
   * Credit / bonus. This is the row that makes a total misleading: a platform
   * credit shows as a NEGATIVE summary line and can take the total to zero.
   * A zero total means credit was consumed, not that the order was free.
   */
  function credit(rows) {
    const block = one('[class*="bonus-channel--bonus--"]');
    const blockText = txt(block);
    const bonusRow = row(rows, /^bonus/i);
    const amounts = (blockText.match(new RegExp(MONEY.source, 'g')) || []).map(money).filter(Boolean);
    return {
      present: !!block || !!bonusRow,
      // The summary row is authoritative for the amount deducted.
      amount: bonusRow ? bonusRow.amount : (amounts[0] ?? null),
      zeroedTheOrder: /deducted to 0|amount has been deducted/i.test(blockText),
      hasEditControl: /\bedit\b/i.test(blockText),
      text: blockText.slice(0, 160) || null,
    };
  }

  /** Address: destination only. Street lines are dropped, never returned. */
  function address() {
    const lines = (document.body.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const i = lines.findIndex((l) => /^shipping address/i.test(l));
    const country = lines.slice(0, 60).find((l) => /\bIsrael\b|ישראל/i.test(l)) || null;
    // "<City>, <District>, Israel, <postcode>" -> city + country only; the street
    // line and postcode are dropped and never returned. Example redacted deliberately.
    let city = null;
    if (country) {
      const parts = country.split(',').map((p) => p.trim());
      city = parts[0] || null;
    }
    return {
      present: i >= 0,
      city,
      country: /israel|ישראל/i.test(country || '') ? 'Israel' : null,
      redacted: ['recipient name', 'street', 'apartment', 'postcode', 'phone'],
    };
  }

  function customs() {
    const lines = (document.body.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const i = lines.findIndex((l) => /^customs information/i.test(l));
    return {
      // Israel requires a national ID for imports. Presence only — never the value.
      present: i >= 0,
      note: i >= 0 ? 'national ID on file; value intentionally not read' : null,
    };
  }

  function payment() {
    const chosen = one('[class*="chosen-channel--chosen-channel-title--"]');
    return {
      // Label only, e.g. "Bonus : US $3.43". Saved instruments are enumerated
      // under [class*="card--payment-card--"] and are deliberately NOT read.
      method: txt(chosen) || null,
      changeControl: !!one('[class*="chosen-channel-change-btn"]'),
      savedInstrumentCount: all('[class*="card--payment-card--"]').length || null,
      redacted: ['card numbers', 'wallet identifiers'],
    };
  }

  function orderParams() {
    const q = new URLSearchParams(location.search);
    const keep = ['objectId', 'skuId', 'skuAttr', 'quantity', 'countryCode', 'provinceCode',
      'cityCode', 'shippingCompany', 'aeOrderFrom'];
    return Object.fromEntries(keep.filter((k) => q.has(k)).map((k) => [k, q.get(k)]));
  }

  const { rows, source } = summaryRows();
  const payBtn = one('button[class*="place-order-primary-btn"]')
    || all('button,[role="button"]').find((b) => /pay now|place order|submit order|בצע הזמנה/i.test(txt(b)));

  const total = row(rows, /^total/i);
  const subtotal = row(rows, /^subtotal/i);
  const shipping = row(rows, /^shipping fee/i);
  const tax = row(rows, /^(tax|vat|מע)/i);
  const cr = credit(rows);

  const snapshot = {
    capturedAt: new Date().toISOString(),
    page: location.pathname,
    settled: !!payBtn && !!total,
    orderParams: orderParams(),
    summarySource: source,
    items: items(),
    summary: {
      rows: rows.map((r) => ({ label: r.label, value: r.value, negative: !!r.amount?.negative })),
      subtotal: subtotal?.amount ?? null,
      shipping: shipping?.amount ?? null,
      // Absent is not the same as zero: absent means "not collected here", and
      // the order may still be assessed on import.
      tax: tax ? tax.amount : null,
      taxLine: tax ? 'present' : 'absent — not collected at checkout',
      total: total?.amount ?? null,
      // Value reads "Enter" (a control) rather than an amount when unused.
      promoCodes: (() => { const r = row(rows, /^promo/i);
        return r ? { present: true, applied: !!r.amount, value: r.value } : { present: false }; })(),
    },
    credit: cr,
    // The number that matters for the Israeli $75 de-minimis is goods value,
    // which is the subtotal — not the total, and not the post-credit figure.
    goodsValue: subtotal?.amount ?? null,
    delivery: { estimate: items().map((i) => i.deliveryText).filter(Boolean)[0] ?? null },
    address: address(),
    customs: customs(),
    payment: payment(),
    terms: (() => {
      const a = all('a').find((x) => /terms and policies/i.test(txt(x)));
      return a ? { text: txt(a), href: a.href } : null;
    })(),
    payControl: payBtn ? { present: true, label: txt(payBtn) } : { present: false, label: null },
    warnings: [],
  };

  if (cr.present && snapshot.summary.total && snapshot.summary.total.value === 0) {
    snapshot.warnings.push(
      'Total is 0 because a platform credit was applied. This is not a free order — '
      + 'state the credit and the pre-credit subtotal before any confirmation.'
    );
  }
  if (!snapshot.settled) {
    snapshot.warnings.push('Page not settled — total or pay control missing. Re-read; do not quote these figures.');
  }
  if (source.includes('fallback')) {
    snapshot.warnings.push('Summary block renamed; parsed from body text. Re-verify selectors before trusting.');
  }
  if (snapshot.address.present && !snapshot.address.country) {
    snapshot.warnings.push('Ship-to country did not read as Israel — check the destination.');
  }

  window.aeConfirm = snapshot;
  return snapshot;
})();
