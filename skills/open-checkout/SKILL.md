---
name: open-checkout
description: Open the AliExpress order-confirmation page for the selected cart items and read back the authoritative totals — real shipping lane, coupons, whether Israeli VAT is collected at checkout, and the final payable figure. Stops before placing anything.
---

# Open AliExpress Checkout

Take the cart to the order-confirmation page and read what the site will **actually**
charge — then stop. No order is placed by this skill.

## Why this is its own skill

Every landed-cost figure elsewhere in this plugin is an estimate assembled from a
listing page: `fetch-listing` prices one lane, `ship-options-il` compares lanes,
`cart-vat-nudge` applies the tax bands to line items. The confirmation page is the
first and only place where the site commits to a number, and it routinely differs
from the estimate, for four legitimate reasons:

1. A **coupon or seller/platform discount** applies only at checkout.
2. The **shipping lane** actually selected for the order may not be the one the cart
   summary advertised.
3. **AliExpress sometimes collects Israeli VAT at checkout itself.** When it does, the
   total already includes tax, and adding a `cart-vat-nudge` VAT estimate on top
   double-counts. This is the single most valuable thing this skill establishes.
4. Promo prices **expired** between adding and checking out.

So the deliverable is not just "the total" — it is the **reconciliation** between the
estimate and the committed figure, with the divergence explained.

## When to use

- "What will this actually cost me?" on a real cart
- Before `buy-now` — it supplies the terms sheet that skill presents
- To settle whether VAT is collected at checkout or left to be assessed on import
- After `cart-vat-nudge` returns AMBER or RED, to check the real number against the
  $75 line

## Preconditions

- Signed in, locale verified (`₪` read, not assumed), ship-to IL — see
  `$CLAUDE_PLUGIN_ROOT/reference/browser.md`
- A **delivery address is already saved** on the account. Checkout with no address
  lands on an address form instead of the confirm page. This skill does **not** fill
  in address forms; it stops and hands back.

## Inputs

- `scope` (optional, default `selected`) — `selected` (the ticked lines, which is what
  the site's own Checkout button acts on) or `single` (one listing via its Buy Now
  path, bypassing the cart).
- `expected_total` (optional) — the estimate to reconcile against, e.g. the landed
  figure from `cart-vat-nudge`. If omitted, run `export-cart` + `cart-vat-nudge`
  first and use their output, so there is always something to reconcile.

## Procedure

1. **Read the cart first**, with `export-cart`. Record which lines are `selected` and
   the selected subtotal. Do this *before* leaving the cart page — once on the confirm
   page you can no longer see what was excluded.
2. **State the scope back to the user** if any line is unticked. "Checkout covers 3 of
   your 5 cart lines" is the most common surprise in this flow.
3. Click the cart's **Checkout** CTA — located by text, per
   `reference/selectors.md`. On the single-item path, use the listing's Buy Now CTA
   after selecting the SKU (the selection procedure is in `add-to-cart`).
4. Wait for the confirm page (`/p/trade/confirm.html`) to settle. It hydrates in
   stages like every other AliExpress page: the shipping block and the tax line arrive
   after the item rows. **Reading early yields a total that is missing tax and
   shipping** — and it looks like a plausible total, which is what makes it dangerous.
   Gate on the total no longer changing across two consecutive reads a second apart.
5. **Read the page** — fields below.
6. **Reconcile** against `expected_total` and explain every difference.
7. **Stop.** Do not click Place Order. Say explicitly that nothing was ordered.

## What to read from the confirm page

| Field | Notes |
|---|---|
| per-line title, SKU, qty, unit price, line total | should match `export-cart` for the selected set |
| **shipping method actually selected** | plus its cost and lead time — this is the committed lane, unlike the cart's summary |
| alternative shipping options | if the selector is present, list them; the cheap default is often not the best (`ship-options-il`) |
| **tax / VAT line** | present, absent, or zero — record which. Absent ≠ zero-rated; it means not collected here |
| coupons / discounts applied | platform, seller and select-coupon lines separately |
| **order total, with its currency glyph** | the payable figure |
| ship-to | report **city + country only**; do not echo the full street address into the transcript |
| payment methods offered | names only. Never read, echo or store card details |

If the tax line is present and non-zero, the order is **already taxed at checkout** —
say so loudly, and do not add an import-VAT estimate on top.

## Output format

```
AliExpress checkout — READ ONLY, nothing ordered
scope: <selected: N of M cart lines | single listing>

Lines:
  <qty> x <₪unit>   <title truncated>        <SKU>
  …

Shipping:  <method> — <₪cost>, <n> days      (<k> other lanes offered)
Discounts: <label> −<₪x>  …
Tax line:  <present: ₪x | absent — not collected at checkout | zero>
---------------------------------------------------------------
TOTAL:     <₪X>   (currency verified: ₪)   ≈ $<Y> @ <rate> <source>@<date>

Reconciliation vs estimate $<expected>:
  <line per divergence, e.g.>
  −$4.10  platform coupon applied only at checkout
  +$2.00  shipping lane on the order is Standard, not the free lane the cart showed
  net: estimate $<a> → committed $<b>

Israel tax position: <goods $<g> vs the $75 line — band, and whether VAT is
already in the total above or still to be assessed on import>

Nothing has been ordered. To place it, use buy-now — it will present these terms
and require an explicit confirmation.
```

## Notes & caveats

- **Opening checkout is not free of side effects.** It can consume a one-shot coupon
  view, and abandoning the page sometimes triggers a follow-up discount offer. It does
  not place an order and does not charge anything.
- **The confirm page's numbers are also perishable.** Coupons expire, stock moves. A
  total read an hour ago is stale; `buy-now` re-reads rather than trusting a figure
  passed to it.
- **A "free shipping" cart line can become a paid lane on the confirm page** when the
  free lane fails the address or the basket composition. This is a common divergence
  and worth calling out rather than netting silently into the total.
- **Currency again:** the confirm page renders in the account currency. If it comes
  back in `US $` after a session you believed was ILS, report the mismatch — do not
  convert and present it as ILS.
- If the flow lands on an **address form, a phone-verification step, or a risk
  challenge**, stop and hand back. Those are the user's to complete.

## Out of scope

- **Placing the order.** That is `buy-now`, and only behind its confirmation gate.
- **Filling in addresses or phone numbers**, choosing a payment instrument, entering
  card or CVV data, completing 3-D Secure or a bank prompt. Never.
- **Applying or hunting coupons.** Report what applied; do not go shopping for codes.
- **Changing the shipping lane on the order.** Read the options and recommend; let the
  user click. (`ship-options-il` does the comparison arithmetic.)

## Validation checklist

1. The cart's selected/unselected split was captured **before** leaving the cart page,
   and reported when the two differ.
2. The confirm page was read only after the total settled across two consecutive
   reads — not on first paint.
3. The tax line was classified as present / absent / zero, and the double-counting
   risk was resolved explicitly one way or the other.
4. The currency glyph on the total was read, not inferred.
5. Every divergence from the estimate is itemised; the reconciliation nets out.
6. The ship-to was reported as city + country, with no street address echoed.
7. The output states plainly that no order was placed.
8. No Place Order, payment-method or address control was clicked.
