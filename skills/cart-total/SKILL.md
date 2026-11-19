---
name: cart-total
description: Calculate and show the AliExpress cart total - every line (title, SKU, qty, unit price, ticked or not, seller, shipping) plus the Summary block as rendered, and where the ticked goods sit against Israel's $75 de-minimis. Read-only. Use on "calculate cart total", "show cart total", "what's my cart come to", "what's in my cart and how much".
---

# Cart Total

Tier 1 (read-only) on the ladder in `$CLAUDE_PLUGIN_ROOT/reference/browser.md`. Reads the cart
page and reports what it says. Changes nothing: no tick, quantity, remove, `Checkout` or `Buy now`.
Reading the cart to a file is `export-cart`; changing it is `edit-cart`.

The cart Summary is an **estimate**. The authoritative payable figure (committed shipping lane,
checkout-only coupons, any VAT collected) is on the confirmation page - `open-checkout`.
Say so in the output.

## Procedure

1. Own tab (never navigate a tab the user is using). Open
   `https://www.aliexpress.com/p/shoppingcart/index.html`. Locale handshake per `browser.md`;
   report in the account currency, never convert silently.
2. **Wait for hydration**: poll until `window.__globalCartHaloContainer?.state?.getData()` exists
   and `.cart-summary` contains `Estimated total` (up to ~10 s). Do not read earlier.
3. Run the reader below (same state source as `edit-cart`'s `snap()`; null-`itemId` ghost nodes
   left by a remove are filtered).

```js
(() => {
  const d = window.__globalCartHaloContainer.state.getData().data;
  const lines = Object.values(d)
    .filter(v => v && v.fields && v.fields.itemView && v.fields.itemView.itemId)   // drop ghosts
    .map(v => {
      const f = v.fields, iv = f.itemView;
      const el = [...document.querySelectorAll('.cart-product')]
        .find(e => e.querySelector('[class*="cart-product-name"]')?.innerText.trim() === iv.title.trim());
      const pv = t => (f.priceViews || []).find(p => p.priceType === t);
      return { itemId: iv.itemId, cartId: iv.cartId, title: iv.title,
        sku: el?.querySelector('[class*="cart-product-sku"]')?.innerText.trim() || iv.sku?.skuInfo || '',
        qty: f.quantityView?.current,
        unit: pv('showPrice')?.formattedAmount, unitValue: pv('showPrice')?.value,
        crossed: pv('crossedPrice')?.formattedAmount,
        ticked: !!f.checkbox?.selected, seller: f.shopView?.name,
        shipping: el?.querySelector('[class*="cart-product-ship-freight"]')?.innerText.trim().replace(/\s+/g, ' ') };
    });
  // Summary: label -> next non-empty line. Badge strings ("Only 8 left", "Almost sold out")
  // interleave with the labels, so never index by position.
  const t = document.querySelector('.cart-summary').innerText.split('\n').map(s => s.trim()).filter(Boolean);
  const summary = {};
  ['Items total','Items discount','Subtotal','Shipping','Extra discounts','Estimated total']
    .forEach(l => { const i = t.indexOf(l); summary[l] = i >= 0 ? t[i + 1] : null; });
  summary.checkout = t.find(s => /^Checkout \(\d+\)$/.test(s));
  return { lines, summary };
})()
```

   A sold-out or invalid line may lack a price or a checkbox; report it as such, do not invent.
4. Cross-check: `Σ unitValue × qty` over ticked lines should equal `Subtotal`, and `Σ crossed × qty`
   should equal `Items total` (held on the 2026-11-19 live cart). If they differ, report the
   difference rather than choosing one.
5. **De-minimis position**: take the ticked goods value (`Subtotal`, goods ex-shipping) and give
   GREEN / AMBER / RED against $75 using the bands in `cart-vat-nudge` (do not restate the cliff
   maths; defer to that skill for headroom, landed cost and the split option). If the account
   currency is not USD, convert per `reference/israel-tax.md` first. Unticked lines are excluded
   and listed as such.
6. State that the figure is the cart's estimate and that `open-checkout` gives the payable total.

## Output format

```
Cart total - <currency verified> - <N> lines, <M> ticked

  [x] <qty> x <title truncated>
        SKU: <sku or "-">   seller: <seller>   shipping: <fee>
        unit <price> (was <crossed>)
  [ ] ...                                  (unticked: not in the total)

Summary as rendered:
  Items total <..>   Items discount <..>   Subtotal <..>   Shipping <..>
  Extra discounts <..>   Estimated total <..>   Checkout (<M>)

De-minimis: ticked goods <$X> vs $75 -> <GREEN|AMBER|RED> (detail: cart-vat-nudge)
Estimate only - the payable figure comes from open-checkout.
```

## Out of scope

Any change to the cart (`edit-cart`), saving to a file (`export-cart`), the committed payable total
(`open-checkout`), tax maths (`cart-vat-nudge`).

## Validation checklist

1. Own tab; hydration waited for (state and `Estimated total` both present).
2. Ghost nodes (null `itemId`) filtered; line count equals `.cart-product` count.
3. Summary read by label, not by position.
4. Ticked-line unit totals reconcile with `Subtotal`, or the gap is reported.
5. De-minimis stated for ticked goods only; `open-checkout` named as authoritative.
6. Nothing clicked: no tick, qty, remove, `Checkout`, `Buy now`.
