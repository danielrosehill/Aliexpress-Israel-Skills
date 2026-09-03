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
in that label is a free cross-check against `export-cart`'s selected count.

## Open defects

- **`add-to-cart` has never successfully added anything.** Two attempts on
  2026-09-03, both clicking the correctly-located "Add to cart" element by reference,
  left the cart empty — badge `0`, `Checkout (0)`, "Your cart is empty". The clicks
  were dispatched and reported as landing. **Cause not diagnosed.** Candidates not yet
  ruled out: the ref click not registering as a trusted gesture; a variant prompt or
  risk check appearing and being missed; the add succeeding into a different cart
  scope. Until this is understood, `add-to-cart` is unproven and its cart-diff
  verification is the only thing standing between it and a false success report.
  Diagnose before trusting it.
- **Quantity stepper not yet exercised.** The `− 1 +` control was located on the
  product page and on the confirm page (a `comet-v2-input-number-input` textbox
  between two buttons), but increment/decrement has not been driven, and the cart-line
  stepper has not been reached at all — the cart could not be populated. This is the
  main gap for a `set-quantity` skill.
- **Removal / empty-cart is unimplemented and uncaptured**, for the same reason: an
  empty cart offers no line to remove. Capture the per-line remove control, the
  select-all checkbox and any batch-delete confirmation modal on a populated cart
  before writing the skill.
- **`buy-now` has not been walked to completion.** The gate and terms sheet are
  specified; the final click has never been made.

## Things not to do again

- **Do not click by coordinate.** See `CLAUDE.md` §1 and the incident recorded there.
- **Do not instrument when you could act.** Timing loops that poll a badge to prove a
  point burn calls and prove little; go to the page that holds the truth and read it.
- **Do not report a write as done because the tool said the click landed.** On this
  site that is a proxy signal, and it has already lied once here.
