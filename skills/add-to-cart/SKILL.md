---
name: add-to-cart
description: Add one AliExpress listing to the signed-in cart with a specific SKU and quantity, then verify the line actually landed by diffing the cart — the first write skill in this plugin.
---

# Add to AliExpress Cart

Put a specific listing — specific variant, specific quantity — into the user's real
signed-in cart, and **prove it landed** rather than assuming the click worked.

This is a **mutating** skill. Everything else in this plugin up to `export-cart` only
reads. See the write-action ladder in
`$CLAUDE_PLUGIN_ROOT/reference/browser.md` — this skill is tier 2 (reversible,
no money moves).

> ⚠️ **Unproven as of 2026-09-03.** Two live attempts, both clicking the correctly
> located CTA by reference, left the cart empty with no error. Cause undiagnosed —
> see the open defects in `docs/admin/development-notes.md`. The cart-diff
> verification below is the only thing that stops that failure being reported as
> success. Do not soften it, and do not report an add as done without it.

## When to use

- The user has decided on a listing and says "add it", "put it in the cart", "add two
  of the 3 m one"
- Building a basket to a target: add, then run `export-cart` → `cart-vat-nudge` to see
  where the $75 line sits
- Staging a purchase that `open-checkout` will price properly and `buy-now` may place

**Not** for deciding *whether* to buy — that is `fetch-listing`,
`check-il-compatibility` and `ship-options-il`. Add only after the user has chosen.

## Preconditions — check all four before clicking anything

1. **Signed in.** The cart only exists for a session. An anonymous add goes into a
   throwaway guest cart the user will never see again, and looks like success.
2. **Locale verified** — `₪` actually rendered, not assumed from the `he.` host. The
   handshake and the failure mode are in `reference/browser.md`. A USD session adds
   fine but every number you report afterwards is in the wrong currency.
3. **Ship-to is IL.** Availability and price are ship-to dependent; an item that adds
   cleanly on a US ship-to may be unavailable to Israel.
4. **Every required SKU axis chosen.** This is the number-one cause of a silent
   no-op — see below.

## Inputs

- `id_or_url` (required) — item id or full listing URL
- `sku` (optional) — the variant to select, as the axis values the user cares about
  (`{"Color": "black", "Length": "3m"}`), or better, the `skuId` itself. If the
  listing has variant axes and none are given, **stop and ask** rather than accepting
  whatever the page pre-selected — the default is often the cheapest, not the one
  discussed.

  ⚠️ **Labels do not identify a variant.** A real fixture carries ten options whose
  labels include `black` twice and `Mix 2pcs` three times. Resolve to `skuId` or to
  the option's index within its axis, and confirm by reading back
  `sku-item--selected--` *and* the price.
- `qty` (optional, default 1) — capped by the listing's per-order ceiling
- `dry_run` (optional, default `false`) — do everything up to the click, report the
  resolved SKU, price and CTA that *would* be used, then stop. Use it when the SKU
  mapping is uncertain.

## Route A — the user's own Chrome (default and only implemented route)

1. `tabs_context_mcp` first. If an AliExpress tab is already open, ask before
   navigating it — the user may be mid-basket.
2. Open the listing. Wait for hydration; the variant grid and the CTA row build late.
3. Run the locale/ship-to verification from `reference/browser.md`. Stop on mismatch.
4. **Select the SKU.** Click each axis value in the variant grid, then re-read the
   price block — price, stock and the shipping panel all change on selection. Assert
   the chosen values now read as active before continuing.
5. **Set quantity.** Type into the qty input rather than clicking `+` n times, then
   read the value back. If the requested qty exceeds the ceiling the input clamps
   silently — report the clamp, do not report the request.
6. **Locate the CTA by reference, never by position.** `find` ("Add to cart button")
   or `read_page filter=interactive`, then act on the ref. The verified selector is
   `button[class*="add-to-cart"]` — unhashed, exactly one match — see
   `reference/selectors.md`. **The "Buy now" button sits ~42px away in the same row**,
   and clicking it bypasses the cart and opens the order-confirmation page. A
   position-based click that drifts by one button height starts an order; that has
   already happened once here. See `CLAUDE.md` §1.
7. Click once. **Do not click twice.** A slow response is not a failed click, and a
   second click adds a second unit.
8. **Verify by cart diff** (below).

## Route B — `mtop.aliexpress.trade.cart.add` (not implemented, deliberately)

The signed endpoint exists and the signing algorithm is known —
`skills/export-cart/reference.md` documents both. It is **not wired up here**: the
UI route inherits the session's promo eligibility, region gating and per-SKU stock
checks, and a malformed signed add can create a line with the wrong `skuId` that
looks right in the cart and ships as something else. If Route B is ever built, it
must still verify through the same cart diff.

## Verification — diff the cart, don't trust the toast

The success toast and the cart badge are both proxy signals: the badge is cached and
has been observed not to increment until reload, and the toast fires on a request
that can still fail server-side.

**Verify the thing itself:**

1. Before the click, capture the cart: run `export-cart` Route A
   (`skills/export-cart/scripts/extract-cart.js`) and keep the set of `cartId`s and
   the total unit count.
2. After the click, re-capture.
3. Assert a **new `cartId`** appears whose `itemId` matches the listing and whose
   `skuId` matches the SKU you selected, with `quantity` equal to the qty you set.
4. If the item was already in the cart, the existing line's `quantity` rises instead
   of a new `cartId` appearing. Both are success; say which happened, because
   "quantity went 1 → 3" is a different outcome from "a second line was added".

An unchanged cart after a click that appeared to work means the add failed. Report
that, do not retry blind — check for a variant prompt, a stock message or a
challenge first.

## Output format

```
Added to cart — <title truncated>
  item <itemId>  sku <skuId>   <SKU axis: value, …>
  qty <n>   @ <₪unit>   line <₪total>     (currency verified: ₪)
  seller: <store name>
  cart now: <N> lines, <U> units, selected subtotal <₪X>

VAT position: <GREEN|AMBER|RED> — goods $<x> vs the $75 line.
  <one line; run cart-vat-nudge for the full picture>
```

Always report the cart's **new** state, not just the added line — the point of adding
is usually the basket total.

## Notes & caveats

- **The added line is ticked for checkout by default**, so it enters the site's own
  subtotal immediately. `export-cart` reports `selected`; if it comes back `false`,
  say so — the user's subtotal will not include it.
- **Adding does not reserve stock or hold the price.** Promo prices expire in the
  cart. An item added today may not check out at today's price; `open-checkout` reads
  the figure that actually applies.
- **Per-order and per-seller quantity ceilings** (`maxQuantity` in `export-cart`)
  break "add one more to reach free shipping" advice. Read the ceiling before
  suggesting it.
- **Choice items ship consolidated**, so adding a fourth Choice item is more likely
  to push one parcel over $75 than to create a second consignment. Flag it.
- **Every add moves the basket toward the cliff.** After any add that takes goods
  value past $60, volunteer the `cart-vat-nudge` number without being asked — that is
  the entire point of this plugin.

## Out of scope

- **Removing lines, changing the quantity of an existing line, ticking/unticking.**
  Not implemented. Tell the user what to click.
- **Checkout, order placement, payment.** `open-checkout` reads the checkout page;
  `buy-now` places an order behind a confirmation gate. Neither is this skill.
- **Coupons and promo codes.** Applied at checkout, not on add.

## Validation checklist

1. Session was signed in and the rendered currency was **read**, not assumed.
2. Every required SKU axis was explicitly selected, and the selection was asserted
   active before the click.
3. Quantity was read back after setting, and any silent clamp was reported.
4. The CTA was located by text/aria, never by a hashed class, and "Add to Cart" was
   distinguished from the adjacent "Buy Now".
5. Exactly one click was issued. No retry was made on an ambiguous outcome.
6. Success was confirmed by a **cart diff**, not by the toast or the badge.
7. Whether a new line appeared or an existing line's quantity rose was stated.
8. The post-add cart total and its position against $75 were reported.
