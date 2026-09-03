# Development notes (admin)

How skills in this repo get built and validated. Not shopping guidance — this is for
whoever works on the plugin next. The hard rules are in `CLAUDE.md` at the repo root;
this file carries the method, the fixtures and the open defects.

## The development path

**Drive Daniel's own Chrome, validate against the real account, then propagate into
the repo.** Stated as a standing preference on 2026-09-03.

Why this and not headless: the skills depend on things that only exist in a real
signed-in profile — an established cart, a saved address, a customs ID on file, a
payment method, promo eligibility, and Choice pricing tied to the account. A fresh
automation profile reproduces none of it, so a skill validated headlessly is not
validated at all.

The loop:

1. Take a real question to the live site in Chrome.
2. Capture what is actually there — labels, roles, accessible names, URL shapes.
3. Write or correct the skill from the capture, not from assumption.
4. Promote the selector to `V <date>` in `reference/selectors.md`.
5. Commit and push.

A skill written ahead of a live run ships with `U` selectors and must say so.

## Test fixtures

Fixed fixtures mean a change in the result is a change in the *site*, not in the
query. Do not swap these out casually.

| Fixture | Value | Used by |
|---|---|---|
| Search query | `USB-C cable` | `selector-verification` — search page, filter chips, cards |
| Write-path test SKU A | item `1005012170805147`, sku `12000057692892678` (`skuAttr=14:193#black`) — dual-tip marker pens, US $1.44, Choice, seller Shop1105409239 | `add-to-cart`, `open-checkout`, `buy-now` |
| Write-path test SKU B | item `1005012995479364` — Claude Code mascot keychain, US $3.41 | quantity stepper, multi-line cart, removal |

Recorded 2026-09-03 at Daniel's direction. SKU A is deliberately cheap and its
purchase is pre-approved, so the tier-3 path can be walked end to end for real. Both
are far under the $75 de-minimis, so a test order carries no tax consequence.

**Prices and stock on the fixtures will drift.** SKU A showed "Only 7 left". When a
fixture goes out of stock, replace it and update this table with the date — a
sold-out fixture produces failures that look like selector rot.

## Live captures worth knowing (2026-09-03)

Selector-level detail lives in `reference/selectors.md`. These are the findings that
change how a skill should be *designed*.

### Buy Now is a URL-constructible flow

Clicking "Buy now" navigates to `/p/trade/confirm.html` with the whole order in the
query string:

```
objectId=<itemId>  skuId=<skuId>  skuAttr=14%3A193%23black  quantity=1
countryCode=IL  provinceCode=910000060000000000  cityCode=910000060006000000
shippingCompany=CAINIAO_FULFILLMENT_STD_PRE_SG  aeOrderFrom=main_detail
```

So the confirm page can be reached directly from `itemId` + `skuId` + `quantity`
without touching the product page's CTA row. That is a much more durable route than
clicking a button — no CTA layout dependency, no variant-grid interaction, no risk of
hitting the wrong button.

**It is also more dangerous**, because it lands one control away from paying. Any
skill using it must still present terms and gate before the final click, and must
never construct such a URL from anything other than an id the user named.

### The final button says "Pay now", not "Place order"

The confirm page's CTA is labelled **`Pay now`**. The fine print underneath it reads
*"Upon clicking 'Place Order', I confirm I have read and acknowledged all terms and
policies."* — so the page's own text names a button that does not exist on it.

A skill matching `/place order|submit order/` finds nothing here. Match `Pay now`
too. The mismatch is a live example of why label text is captured rather than guessed.

### An IL order carries a customs ID

The confirm page shows a **Customs information** block with a masked national ID.
Israel requires it for imports, it is already on the account, and it is not something
a skill should ever read, echo or fill. Report the block's presence and move on.

### Bonus credit can make the total $0.00

On SKU A the summary read: subtotal $1.44, shipping $1.99, **Bonus −$3.43, total
$0.00**. A zero total is not evidence that nothing is being spent — it means a
platform credit is being consumed. `buy-now`'s terms sheet must state the credit
applied, not just the total, or the user cannot tell a free order from a spent
balance. The confirmation phrase binding to `0.00` is technically correct and
practically useless, so name the credit explicitly.

### Variant labels are not unique

SKU A has ten colour options whose visible labels include `black` twice and
`Mix 2pcs` three times. A `sku` input expressed as a label cannot identify a variant.
Resolve to `skuId`, or to the option's index within its axis, and confirm the
selection by reading back `sku-item--selected--` plus the price.

### The cart's empty state

`Your cart is empty`, badge `0`, and the checkout CTA reads `Checkout (0)`. The count
in that label cross-checks `export-cart`'s **line** count — not its unit count; see the
2026-09-04 correction below.

## Resolved: the `add-to-cart` defect  (2026-09-04)

**Status: root-caused and fixed.** This was the blocker behind every other gap below,
and it was never a selector problem.

**Symptom.** Clicking a correctly-located "Add to cart" element reference left the cart
empty. The tool reported `Clicked on element ref_244`. No toast, no modal, no error.

**What ruled out what.** Hooking `fetch` and `XMLHttpRequest` before the click showed
**zero requests** leaving the page. That single measurement killed three of the four
candidate causes at once: it was not a server-side rejection, not a risk check, and not
an add into a different cart scope — the site's handler never ran.

**Cause.** A coordinate-space mismatch. The page's CSS viewport is 2133 × 1003; the
screenshot `computer` returns is 1425 × 712. A `ref` resolved through the screenshot
space lands ~1.5× off — `document.elementFromPoint` at the screenshot-space position for
the button returns `P.seo-sellpoints--terms`, a disclaimer paragraph. The click was
real; it hit the wrong element, on a page region with no handler, and so did nothing
observable.

**Fix.** Dispatch on the node instead of at a position:

```js
document.querySelector('button[class*="add-to-cart"]').click();   // 17 requests, item lands
```

Full measurements in `reference/selectors.md` → "How to click on this site".

**The doctrine consequence.** `CLAUDE.md` §1 said to use element references rather than
coordinates. That is now known to be only half right: a reference is a sound way to
**locate**, but acting through `computer(ref)` still crosses the broken coordinate
space. Locate semantically, then act with `element.click()`. §1 has been amended.

**Why the earlier run misread it.** The 2026-09-03 attempt checked the cart badge, which
reads `...` indefinitely, and concluded "nothing happened" — correct by luck, for the
wrong reason. The badge would have said the same thing on a successful add.

## Cart write path — validated 2026-09-04

With the cart populatable, everything previously blocked was exercised live on the
fixtures:

| Operation | Mechanism | Result |
|---|---|---|
| add to cart | `button[class*="add-to-cart"]` → `.click()` | line lands; `Cart (1)`, subtotal $1.44 |
| increase qty | `[aria-label="increase"]` → `.click()` | qty 1→2, subtotal $1.44→$2.88, total $3.43→$4.87 |
| decrease qty | `[aria-label="decrease"]` → `.click()` | qty 2→1, subtotal back to $1.44 |
| multi-line cart | added SKU B alongside SKU A | 2 lines, subtotal $4.85, one `.group-title-ctn` |
| delete one line | `[aria-label="delete product"]` → confirm modal → `Remove` | 2 lines → 1 |
| checkout | `button.cart-summary-button` | navigates to cart-route confirm page |

Totals are recalculated server-side on every quantity change, so a skill must re-read
after acting rather than computing the new total locally.

**Two premises corrected.** `Cart (N)` / `Checkout (N)` count **lines, not units** — a
qty change leaves them unmoved, so they cannot cross-check a unit count. And the cart
badge `[class*="shop-cart--number--"]` is a `...` placeholder that frequently never
resolves; nothing should gate on it.

**Cart line order is newest-first.** Identify a line by title or SKU, never by index.

## The full write path, walked  (2026-09-04)

`buy-now` has now been walked to completion against fixture SKU A. Terms were read off
the confirm page, presented, and the order placed on explicit authorisation; Daniel
cancelled it immediately afterwards, which incidentally gave the cancelled-state
capture too.

What the run established that no amount of reading could:

- **`Pay now` lands on `/p/second-payment/pay-result.html?pmntId=...`**, which shows
  `Payment Successful` but **no order id**. The `pmntId` is a payment id. A skill that
  waits for an order id here waits forever.
- **`Check order` opens a new tab.** The originating tab stays put. Anything holding
  the old tab id afterwards is reading a stale page.
- **The order id is the `orderId` query param** on `/p/order/detail.html`, displayed
  as **`Ref. Number:`** — not "Order ID".
- **The cart count drops to `0`** on purchase, which is a free, independent
  confirmation that does not depend on reading any success banner.
- **Cancellation is `Cancel`, not "Cancel order"**, and lives only on the order detail
  page while status is `Processing`. It also **arrives late**: read ~4 s after load on
  a fresh order the action row lacked it entirely, while a settled Processing order
  carried it. That is the same staged-hydration trap this repo has now hit on four
  different pages.
- **The orders list lags the detail page** — it still said `Processing` for an order
  whose detail page already said `Canceled`. The detail page is authoritative.

The order total was $0.00 against a $3.43 platform credit, which is exactly the case
the terms sheet exists for: nothing was charged to a card, but $3.43 of stored balance
was consumed. Presenting only "total: $0.00" would have been true and useless.

## Still open

- **Batch delete is mapped but undriven.** `div.cart-header-delete-btn` and the
  select-all / seller-group checkboxes are located; only the per-line delete has been
  clicked, so a batch-delete confirmation modal (if it differs) is uncaptured.
- **Seller-group and select-all checkboxes are located but not exercised.** All three
  scopes share `aria-label="unselect product"`; only the per-line one has been clicked.
- **`div.cart-header-delete-btn` (batch delete) is located but not exercised**, and its
  confirmation modal — if it differs from the single-line one — is uncaptured.
- **Delivery panel, spec table and variant grid on the product page remain `U`.**

## Things not to do again

- **Do not click by coordinate.** See `CLAUDE.md` §1 and the incident recorded there.
- **Do not instrument when you could act.** Timing loops that poll a badge to prove a
  point burn calls and prove little; go to the page that holds the truth and read it.
- **Do not report a write as done because the tool said the click landed.** On this
  site that is a proxy signal, and it has already lied once here.
