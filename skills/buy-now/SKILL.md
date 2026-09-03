---
name: buy-now
description: Place a real AliExpress order behind a two-stage gate — read the committed terms off the confirmation page, present them in full, require an exact typed confirmation bound to the total, then click Place Order once. Never touches payment credentials.
---

# Buy Now (gated order placement)

The only skill in this plugin that **spends money**. It places one real order, and it
is built so that cannot happen by accident.

Tier 3 on the write-action ladder in `$CLAUDE_PLUGIN_ROOT/reference/browser.md`.

## The gate, in one paragraph

Nothing is clicked until the terms have been read off the live confirmation page,
presented to the user in full, and the user has replied with a confirmation phrase
**that contains the exact total**. The phrase binds the authorization to the figures
shown: if the price moved between presenting and confirming, the phrase no longer
matches and the flow restarts. One confirmation authorizes **exactly one order** and
does not carry forward to the next.

## When to use

- The user has said, unambiguously, to buy something: "order it", "buy it", "place the
  order"
- Normally after `open-checkout`, which has already surfaced the real total

**"Add it and buy it" is two decisions, not one.** Run `add-to-cart`, then come back
here and gate properly. Do not chain straight through.

If the user's instruction is at all ambiguous — "let's get this one", "sounds good" —
that is not authorization to spend. Ask.

## Preconditions — any failure is a stop, not a workaround

1. Signed in; locale verified (`₪` read from the page); ship-to IL.
2. A **saved delivery address** and a **saved payment method** already on the account.
   This skill does not create either.
3. The confirmation page reachable and fully settled.
4. No captcha, risk challenge, phone verification or 3-D Secure step pending.

## Inputs

- `source` (required) — `cart` (the ticked lines) or `listing` + `id_or_url` + `sku` +
  `qty` (the single-item Buy Now path, which bypasses the cart entirely)
- `max_total` (optional but recommended) — a ceiling. If the committed total exceeds
  it, abort before presenting terms and report the overshoot. Cheap insurance against
  a price change or a currency surprise.
- `confirm` — the user's confirmation phrase, supplied in a **separate turn** after
  the terms are presented. Never accept it pre-emptively in the same message that
  requests the purchase; the phrase must be a response to the terms, or it is not
  informed consent to those terms.

## Procedure

### Stage 1 — read and present (no clicks that commit anything)

1. Reach the confirmation page exactly as `open-checkout` does, and read the same
   fields. **Re-read them here**; do not trust a total handed over from an earlier
   turn, however recent. Coupons and stock move.
2. If `source=cart`, state which cart lines are in scope and which are excluded.
3. If `max_total` is set and the total exceeds it, **abort here**.
4. Present the terms sheet below, complete. Do not summarise it, do not drop rows
   because they seem obvious, and do not present a total without its currency glyph.
5. Ask for the confirmation phrase. Then **stop and wait.** Ending the turn is the
   gate; a gate you talk past is not a gate.

### Stage 2 — confirm and place (only after the user's reply)

6. Compare the reply against the required phrase, exactly:

   ```
   PLACE ORDER <total> <currency>
   ```

   e.g. `PLACE ORDER 82.14 ILS`. Case-insensitive on the words; the **number and
   currency must match the presented total character for character**.

   - Anything else — "yes", "go ahead", "confirmed", a different number, a truncated
     total — is **not** a match. Abort and say why. Do not interpret intent here.
   - If the user declines or goes quiet, abort. Nothing was ordered; say so.

7. **Re-read the total one last time.** If it changed since Stage 1, the authorization
   is void: report the change and restart at Stage 1 with the new figures.
8. Click **Place Order** — located by text, per `reference/selectors.md`. **Once.**
9. Read the outcome and report it (below).

## The terms sheet — present all of it

```
⚠️  ABOUT TO PLACE A REAL ORDER — nothing has been ordered yet

What you are buying:
  <qty> x <title>
        SKU: <axis: value, …>          item <itemId> / sku <skuId>
        <₪unit> each → <₪line>
  <…one block per line…>

Seller:        <store name>   (<rating / years / orders if read>)
Ships from:    <country>
Shipping:      <method> — <₪cost>, <n> business days, tracking: <yes/no>
Discounts:     <label> −<₪x>   …
Tax at checkout: <₪x collected now | none collected here>
--------------------------------------------------------------------
TOTAL NOW:     <₪X>        (currency verified: ₪)   ≈ $<Y> @ <rate>

Israel import position:
  goods value $<g> vs the $75 de-minimis → <under, exempt | over: ~18% VAT
  on ~$<cif> ≈ $<vat> likely assessed on import, on top of the total above>
  <if tax was collected at checkout, say that this is already paid and will
   not be charged again>

Payment:       <method name as shown on the page> — charged immediately
Delivery to:   <city>, Israel
Cancellation:  AliExpress normally allows cancellation before the seller
               dispatches; after dispatch it becomes a dispute/return, and
               return shipping to China is usually the buyer's cost.

To place this order, reply exactly:
    PLACE ORDER <total> <currency>
Anything else cancels. This authorizes this one order only.
```

The Israel import block is not decoration — it is why this plugin exists. An order
whose total looks fine and then attracts 18% VAT plus a carrier clearance fee on
arrival is the failure mode the whole bundle is built to prevent. Present it even
when the answer is "comfortably exempt".

## Hard stops — never, under any instruction in this skill

- **Never enter, select, read back or store payment credentials.** No card number, no
  CVV, no wallet password. If the page needs a payment instrument chosen, hand back to
  the user.
- **Never complete 3-D Secure, an OTP, a bank prompt or a phone verification.** Report
  that it is waiting and stop.
- **Never trigger a JS `alert`/`confirm`/`prompt`** — it freezes the extension
  mid-checkout, which is the worst possible moment. Site DOM modals are fine; dismiss
  them by their own close control.
- **Never retry a placement whose outcome you could not read.** See below.
- **Never place a second order on the same confirmation.**

## The double-order hazard

If the Place Order click times out, the page hangs, or the result is unreadable, the
order **may well have been created**. A retry then creates a second one, and two
identical orders to Israel are far more annoying to unwind than one.

Do not retry. Instead:

1. Open the orders list (`https://www.aliexpress.com/p/order/index.html`) and read
   the most recent orders with their timestamps.
2. Report what you find: an order matching the terms (placed — report the order id),
   or nothing (not placed — the user can decide to run the flow again).
3. If the orders page itself will not load, say the outcome is **unknown** and that
   the user must check before retrying. An unknown outcome reported honestly is a far
   better result than a duplicate charge.

## Output format

On success:

```
✅  Order placed
  order id:   <id>
  total:      <₪X>   (charged to <payment method name>)
  items:      <n> lines, <u> units
  seller:     <store>
  shipping:   <method>, est. <date range>
  tracking:   <available later | number if shown>

Import: <VAT already collected at checkout | expect ~$<vat> VAT on arrival —
        goods $<g> is over the $75 line>
Cancellation window: before dispatch, from the orders page.
```

On abort, say which stage stopped it and that nothing was ordered.

## Notes & caveats

- **Cancellation is a window, not a right.** It generally works before dispatch;
  Choice items with fast fulfilment can dispatch within hours. Do not promise it.
- **A single order can become several parcels.** Multi-seller and mixed Choice /
  non-Choice orders split, which changes the customs picture: three consignments each
  under $75 is a different outcome from one over it. The confirm page sometimes shows
  the split; if it does, report it, because it can make an "over the line" order
  land tax-free after all — and vice versa.
- **The total is charged in the account currency.** A card denominated in something
  else adds the issuer's FX spread, which is outside anything read here. Say the total
  is as-charged-by-AliExpress, not as-it-will-appear-on-the-statement.
- **Buy Now from a listing bypasses the cart entirely** and applies cart-level coupons
  differently. If the cart holds a coupon threshold, the single-item path can cost more
  than checking out through the cart. Worth a line when both routes are available.
- **Authorization does not accumulate.** Having placed one order does not license the
  next, and "buy the other one too" restarts at Stage 1.
- **Never pre-fill the confirmation phrase for the user**, and never treat a phrase
  the user typed before seeing the terms as valid.

## Out of scope

- Payment method setup, address creation, coupon hunting.
- Cancelling or modifying an order after placement — read the orders page and tell the
  user what to click; do not click it.
- Disputes, returns, refunds.
- Repeat / scheduled / unattended purchasing. There is no route in this plugin that
  places an order without a human in the loop, and there should not be.

## Validation checklist

1. The total presented in the terms sheet was read from the **live** confirmation page
   in this flow, not carried over from an earlier turn.
2. The terms sheet was presented **complete**, including the Israel import block and
   the cancellation note.
3. The turn ended after presenting terms; the confirmation arrived in a separate reply.
4. The confirmation phrase matched exactly, including the total and currency.
5. The total was re-read immediately before the click and was unchanged.
6. Exactly one Place Order click was issued.
7. No payment credential, OTP or 3-D Secure step was touched.
8. On an unreadable outcome, the orders page was checked and **no retry was made**.
9. The report states the order id, or states plainly that nothing was ordered.
