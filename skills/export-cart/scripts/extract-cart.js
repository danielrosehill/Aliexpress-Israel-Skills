/*
 * AliExpress cart exporter — paste into the DevTools console on
 * https://www.aliexpress.com/p/shoppingcart/index.html
 *
 * Reads the already-parsed Ultron payload out of the page's state container.
 * No signing, no API call, no cookies handled. Read-only.
 *
 * Verified 2026-08-02. See ../reference.md for the field map and failure
 * triage. Canonical source: the Aliexpress-Cart-Analysis repo.
 *
 *   aeCart.items()  -> array of flat item records
 *   aeCart.total()  -> {currency, items, units, gross, net, saved}
 *   aeCart.json()   -> pretty JSON string
 *   aeCart.csv()    -> CSV string
 *   aeCart.save()   -> downloads aliexpress-cart-<date>.json
 */
(() => {
  const container = window.__globalCartHaloContainer;
  if (!container || !container.state) {
    throw new Error(
      'Cart container not found. Are you on the cart page, fully loaded?'
    );
  }

  const payload = () => container.state.getData();

  // Product nodes are identified structurally, not by component name — the
  // name has changed several times and will change again.
  const nodes = () =>
    Object.entries(payload().data).filter(
      ([, v]) => v && v.fields && v.fields.itemView
    );

  const priceOf = (fields, type) =>
    (fields.priceViews || []).find((p) => p.priceType === type) || {};

  function items({ includeInvalid = false } = {}) {
    return nodes()
      .map(([nodeKey, node]) => {
        const f = node.fields;
        const iv = f.itemView;
        const qv = f.quantityView || {};
        const show = priceOf(f, 'showPrice');
        const crossed = priceOf(f, 'crossedPrice');
        const qty = qv.current ?? 1;
        const unit = show.value ?? show.amount ?? null;

        return {
          nodeKey,
          cartId: iv.cartId,
          itemId: iv.itemId,
          skuId: iv.skuId,
          title: iv.title,
          skuInfo: (iv.sku && iv.sku.skuInfo) || '',
          brand: (iv.sku && iv.sku.brandName) || '',
          quantity: qty,
          maxQuantity: qv.max ?? null,
          selected: !!(f.checkbox && f.checkbox.selected),
          currency: show.currency || null,
          unitPrice: unit,
          unitPriceFormatted: show.formattedAmount || null,
          crossedPrice: crossed.value ?? crossed.amount ?? null,
          lineTotal: unit == null ? null : +(unit * qty).toFixed(2),
          valid: iv.valid,
          status: iv.status,
          storeName: (f.shopView && f.shopView.name) || null,
          sellerId: (f.shopView && f.shopView.sellerId) || null,
          storeUrl: (f.shopView && f.shopView.homeUrl) || null,
          freeShipping: !!(f.logisticsView && f.logisticsView.freeShipping),
          shippingCost: (f.logisticsView && f.logisticsView.freightCost) || null,
          deliveryDays: (f.logisticsView && f.logisticsView.deliveryDays) ?? null,
          addedAt: iv.createTimeStamp
            ? new Date(iv.createTimeStamp).toISOString()
            : null,
          productUrl: `https://www.aliexpress.com/item/${iv.itemId}.html`,
          imageUrl: iv.imageUrl || null,
        };
      })
      .filter((r) => includeInvalid || r.valid);
  }

  // Computed from the item rows rather than read from the summary component,
  // which reports selected items only and returns display strings not numbers.
  function total(opts) {
    const rows = items(opts);
    const priced = rows.filter((r) => r.lineTotal != null);
    const gross = priced.reduce(
      (a, r) => a + (r.crossedPrice ?? r.unitPrice) * r.quantity,
      0
    );
    const net = priced.reduce((a, r) => a + r.lineTotal, 0);
    return {
      currency: (priced[0] && priced[0].currency) || null,
      items: rows.length,
      units: rows.reduce((a, r) => a + r.quantity, 0),
      gross: +gross.toFixed(2),
      net: +net.toFixed(2),
      saved: +(gross - net).toFixed(2),
    };
  }

  function csv(opts) {
    const rows = items(opts);
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const esc = (v) =>
      v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;
    return [
      cols.join(','),
      ...rows.map((r) => cols.map((c) => esc(r[c])).join(',')),
    ].join('\n');
  }

  const json = (opts) =>
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        source: 'mtop.aliexpress.trade.cart.render (via page state)',
        summary: total(opts),
        items: items(opts),
      },
      null,
      2
    );

  function save(opts) {
    const blob = new Blob([json(opts)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aliexpress-cart-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  window.aeCart = { items, total, csv, json, save, raw: payload };
  console.log(
    '%caeCart ready',
    'font-weight:bold',
    '— aeCart.items() / .total() / .csv() / .save()'
  );
  console.table(items());
  return total();
})();
