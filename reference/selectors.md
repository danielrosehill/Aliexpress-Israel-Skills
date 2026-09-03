# DOM selector reference

Every selector this plugin depends on, in one place, with its verification status.
Skills link here instead of carrying their own copy.

**Rule that governs all of these:** AliExpress ships hashed, per-build class names
(`il_v`, `ip_iq`, `ie_a6`) and versioned sprite classes (`country-flag-y2023`).
Never anchor on them. Anchor on `aria-label`, on role, or on a `[class*="prefix--"]`
substring where the prefix is a stable BEM-ish module name.

Status key: **V** = verified against the live DOM · **U** = unverified, candidate
anchors only, capture before trusting.

---

## ⚠️ How to click on this site  (V 2026-09-04)

**`computer` clicks — including `ref` clicks — do not reliably reach handlers on this
machine. Use a DOM-level dispatch instead.**

Locate semantically, then dispatch on the element itself:

```js
// via mcp__claude-in-chrome__javascript_tool
const b = document.querySelector('button[class*="add-to-cart"]');
b.click();                       // fires React's handler; no coordinates involved
```

### What was measured, 2026-09-04

The `add-to-cart` defect that stood open since 2026-09-03 — "click lands, cart stays
empty" — is this, and it is not a selector problem at all.

| Input method | Network requests fired |
|---|---|
| `computer left_click` with `ref` from `find` | **0** |
| `element.click()` via `javascript_tool` | **17** |

The cause is a coordinate-space mismatch. On this display:

| Space | Size |
|---|---|
| page CSS viewport (`window.innerWidth/Height`) | **2133 × 1003** |
| screenshot returned by `computer` | **1425 × 712** |

`devicePixelRatio` is `0.9`, `outerWidth` is `1920`. Feeding the button's real page
coordinates into the screenshot space, or vice versa, lands roughly 1.5× off:

```js
document.elementFromPoint(1676, 518);   // page space  -> SPAN "Add to cart"   ✅
document.elementFromPoint(1231, 365);   // screenshot space -> P.seo-sellpoints--terms  ❌
```

So a `ref` click resolved through the screenshot space lands on a **disclaimer
paragraph**. Nothing is thrown; the tool reports "Clicked on element ref_244" and the
page does nothing. That is the whole defect.

**Confirmed:** the request counts, the viewport figures, and the `elementFromPoint`
results above. **Inferred:** that the `ref` → coordinate resolution is specifically
where the scaling is lost — the tool's internals were not read.

This supersedes the older advice that an element reference is a safe handle. A
reference is a good way to *locate*; it is not a reliable way to *act*. The durable
act is `element.click()` on a semantically-selected node, which is equally free of
pixel dependence and actually reaches the handler.

`aria-label` and unhashed-class selectors in this file remain correct — they are what
you pass to `querySelector`.

### Two mechanics that bite

- **A click that navigates kills the evaluation.** `javascript_tool` throws
  `Inspected target navigated or closed` if a long `await` sleep spans the navigation.
  Click in one call, read in the next.
- **`/item/*.html` on `www.` redirects to `he.aliexpress.com?gatewayAdapt=glo2isr`**,
  and evaluating during the redirect fails with *"Permission denied for JavaScript
  execution on this domain"*. That is a race, not a missing permission — re-issue once
  the URL has settled.

## ⚠️ Read this before concluding any selector is broken

**AliExpress search results hydrate in stages, over ~10 seconds.** A probe run too
early sees a partially-built DOM and reports failures that are not real. Measured
2026-09-01 on the same page, same session, no reload:

| Read at | `a[href*="/item/"]` | `input[type=checkbox]` | `[aria-label^="filterCode:"]` |
|---|---|---|---|
| ~4 s (after scroll loop) | 4 | 0 | 0 |
| fully settled | 13 | 4 | 4 |

Every filter selector in this file "failed" on the early read and passed on the late
one. **Nothing had rotated.** Gate on a sanity condition before trusting a negative:

```js
// wait until the grid stops growing, then probe
const settled = async () => {
  let prev = -1, n = 0;
  for (let i = 0; i < 20; i++) {
    n = document.querySelectorAll('a[href*="/item/"]').length;
    if (n === prev && n >= 10) return n;
    prev = n;
    await new Promise(r => setTimeout(r, 1000));
  }
  return n;
};
```

If the count never reaches 10 on a broad query like `USB-C cable`, the page did not
render — report **inconclusive**, not failure. `skills/selector-verification` bakes
this in.

## ⚠️ The `he.` subdomain does not set the locale

Verified 2026-09-01: loading `https://he.aliexpress.com/w/...` while signed in gave
`document.documentElement.lang === "en"` and a language switcher reading **`EN/USD`**,
with every price rendered as `US $4.26`. The site knew it was the Israel storefront
(switcher label: *"…shopping on AliExpress il"*) yet served English and USD.

**The account/profile preference wins over the hostname.** The claim that visiting
`he.aliexpress.com` writes the ILS cookies is false for an account already set to
EN/USD. Skills must verify the rendered currency and either switch it explicitly via
the on-page picker or report the mismatch — never assume `₪` because of the host.

## Search results page — filter chips  (V)

Host: `https://he.aliexpress.com/w/wholesale-<url-encoded-query>.html`

**Confirmed 2026-09-01** (`USB-C cable`, EN/USD session, after full hydration).
The chips render as a **left sidebar**, not a horizontal chip row. Each is a wrapper
carrying the `aria-label`, containing an `<input type="checkbox">`. Click the
**wrapper**, not the inner input.

| Filter | Selector | Status |
|---|---|---|
| Free shipping | `[aria-label="filterCode:freeshipping"]` | V 2026-09-01 |
| Choice | `[aria-label="filterCode:choice_atm"]` | V 2026-09-01 |
| 4★ & up | `[aria-label="filterCode:4StarRating"]` | V 2026-09-01 |
| Sale / big sale | `[aria-label="filterCode:bigsale"]` | V 2026-09-01 — undocumented until now |
| Premium Quality | `[aria-label="filterCode:PremiumQuality"]` | **U** — absent on this fixture |

`PremiumQuality` returned 0 on `USB-C cable` while the other four returned 1 each.
That is consistent with the chip being category-dependent rather than rotated, but it
is **not proven** — re-test on a category where Premium Quality is offered before
treating its absence as normal. The inner input carries no `aria-label` and no
`name`; the wrapper is the only stable handle.

```js
const toggleChip = (code) => {
  const el = document.querySelector(`[aria-label="filterCode:${code}"]`);
  if (!el) return null;
  if (el.getAttribute('aria-checked') !== 'true') el.click();
  return el.getAttribute('aria-checked');
};
```

Assert `aria-checked === 'true'` **after** the re-render. If it is still `false`:
zero-result query, captcha, or unhydrated DOM. Wait once, retry once, then bail with
a clear error — do not report unfiltered results as filtered.

## Search results page — ship-from country  (V)

Single-select radio group. Options on an IL account: `-1` (All) / `IL` / `TR` / `CN`.
`[aria-label="IL"]` **confirmed present, 2026-09-01** (1 match). Note the sibling
radios in the same sidebar use category ids as their `aria-label` (`10130-4358550`),
so scope to the country group rather than assuming every radio is a country.

```js
document.querySelector('[aria-label="IL"]').click();        // set
document.querySelector('.il_v [aria-checked="true"]')?.getAttribute('aria-label');  // read
```

`.il_v` is a hashed scope and *will* rotate. If the read returns nothing, fall back
to scoping under the "Shipping from" / "נשלח מ" header by text.

## Search results page — product cards  (V)

**`[class*="price"]` is broken — do not use it.** Measured 2026-09-01 on a fully
hydrated page: **0 of 13** cards matched. The price is split across `<span>` leaves
carrying *only* hashed classes (`lz_kw` holds the `US $` glyph, `lz_lp` the digits),
with no `price` substring anywhere in the card. This is the one documented selector
that genuinely rotated.

**Working replacement — parse the card's `innerText`.** 13/13 on the same page, and
currency-agnostic, so it survives an ILS session unchanged:

```js
[...document.querySelectorAll('a[href*="/item/"]')]
  .filter(a => (a.innerText || '').trim())
  .map(a => {
    const text = a.innerText;
    const prices = text.match(/(?:US ?\$|₪)\s?[\d,]+\.?\d*/g) ?? [];
    return {
      id: a.href.match(/item\/(\d+)/)?.[1],
      url: a.href.split('?')[0],
      title: text.split('\n').find(l => l.length > 15) ?? null,
      priceText: prices[0] ?? null,        // live price
      crossedText: prices[1] ?? null,      // struck-through "was", when present
    };
  })
  .filter(c => c.id && c.title);
```

A card's `innerText` reads, in order: title, live price, crossed price, discount %,
rating, sold count. **The first currency match is the payable price** — do not sort
the matches numerically, the crossed price is higher and would win.

`[aria-label^="US $"]` also matched 13/13 and is a viable alternate, but it hard-codes
the currency and would need a second pattern under ILS. Prefer the `innerText` parse.

Title via `[class*="title"], h3, [title]` **still works** — 13/13, V 2026-09-01.

De-dupe by item id (`/item/(\d+)\.html`) — the same listing appears in multiple ad
slots. Price strings vary: `₪12.34`, `₪1,234.56`, ranges `₪10.00 - ₪25.00`. Parse
defensively; never assume a fixed format.

## Product page — review filter chips  (V)

Chip wrappers: `[class*="filter--filterItem--"]`. The Israel chip carries a child
`<span>` whose class list holds *some* `country-flag-*` versioned class **plus** the
bare ISO-2 `IL`.

```js
const ilChip = document.querySelector('[class*="country-flag-"].IL')
                  ?.closest('[class*="filter--filterItem--"]');
const ilCount = parseInt(ilChip?.textContent.match(/\((\d+)\)/)?.[1] ?? '0', 10);
```

- Reviews section present: `[class*="title--wrap--"]`
- Chip disabled: wrapper carries `[class*="filter--invalid--"]`
- Chip active after click: `ilChip.matches('[class*="filter--active--"]')`
- "View more": `[...document.querySelectorAll('[class*="v3--btn--"]')].find(b => /view more|טען עוד|הצג עוד/i.test(b.textContent))`

## Product page — review items  (V)

Each review: `[class*="list--itemBox--"]`.

| Field | Selector (relative to item box) |
|---|---|
| stars (1–5) | `[class*="stars--box--"] .comet-icon-starreviewfilled` → count |
| variant / SKU | `[class*="list--itemSku--"]` |
| body | `[class*="list--itemReview--"]` (may be empty — tag `star-only`) |
| customer photos | `[class*="list--itemThumbnails--"] img` → `src[]` |
| product thumb | `[class*="list--itemPhoto--"] img` → `src` |
| username + date | `[class*="list--itemInfo--"] span`, split on ` \| ` |
| helpful count | `[class*="list--itemHelpText--"]` → `\((\d+)\)` |

Usernames are masked site-wide (`AliExpress Shopper`) — never present a reviewer
identity. Dates render per `b_locale`, so in Hebrew (`11 בפבר׳ 2026`); parse
defensively and return the raw string on failure.

## Product page — delivery / shipping options panel  (U)

**Not yet captured. Do not treat anything below as validated.** `ship-options-il`
carries the capture procedure; run it once and promote the results into this section
with a verification date.

What is known:

- The panel is JS-rendered and gated on the ship-to country in `aep_usuc_f`. Reading
  it with `fetch` returns nothing useful.
- Multiple options are only exposed after opening the shipping row — the collapsed
  row shows one default option, usually the cheapest, not the best.
- Choice listings render a different panel from non-Choice ones.

Candidate anchors to *test*, in preference order:

1. Text anchor on the localized labels — `משלוח` / `Shipping` / `אספקה` — then walk
   to the containing block. Most durable across builds.
2. `[class*="dynamic-shipping"]` — long-standing module prefix on the shipping block.
3. `[class*="comet-v2-modal"]` for the options modal once the row is opened.

Prefer route 1 and verify against the rendered text, not the class.

## Product page — specification table  (U)

**Not yet captured.** Used by `check-il-compatibility` to read plug type, voltage and
frequency. Candidate anchors to test:

```js
[...document.querySelectorAll('[class*="specification"] li, [class*="spec"] li')]
  .map(el => el.innerText.trim()).filter(Boolean);
```

Fall back to a regex sweep of `document.body.innerText` for
`/Plug|Voltage|Frequency|תקע|מתח|\b\d{2,3}\s?V\b|\bHz\b/`. The table is often
collapsed behind a "more" toggle — expand before reading, or you get the first four
rows only. Promote to `V` with a date once verified.

## Product page — variant / SKU grid  (U)

Plug type, size and colour are variants, not listing properties. The grid is
JS-gated: the price and the shipping panel both update on selection, so read them
*after* clicking, never before. Used by `hunt-pricing-anomaly`,
`check-il-compatibility` and `ship-options-il`.

## Product page — CTA row: add to cart / buy now  (V 2026-09-03)

**Confirmed live** on item `1005012170805147` (EN/USD session, signed in, Chrome).
Both buttons carry **unhashed, semantic module prefixes** — a much better handle than
the text matching this file previously recommended:

| Action | Selector | Full class observed |
|---|---|---|
| Add to cart | `button[class*="add-to-cart"]` | `comet-v2-btn comet-v2-btn-primary comet-v2-btn-large add-to-cart--addtocart--Qhoji3M add-to-cart--hasBuyNow--QxW176q comet-v2-btn-important` |
| Buy now | `button[class*="buy-now"]` | `comet-v2-btn comet-v2-btn-primary comet-v2-btn-large buy-now--buynow--OH44OI8 comet-v2-btn-important` |

Each matched **exactly 1** element. `comet-v2-*` is AliExpress's Comet design system
and is not hashed; only the `--Qhoji3M` suffix rotates, which is why the `class*=`
substring holds. The `add-to-cart--hasBuyNow--` modifier is present when a Buy Now
button sits alongside — a useful signal that the row has two controls.

Labels on this fixture: `Add to cart` / `Buy now` (sentence case, not `Add to Cart`).
Match case-insensitively and keep the Hebrew alternates (`הוסף לסל`, `קנה עכשיו`) as
a fallback for a Hebrew-rendered session.

⚠️ **The two buttons are ~42px apart.** Locate by reference and act on the reference —
never by position. A coordinate off by one button height starts an order. See
`CLAUDE.md` §1.

### Quantity stepper (V 2026-09-03)

`− <input> +`, where the input is `input.comet-v2-input-number-input` (unhashed
Comet class) holding the current value as text. The two buttons are its siblings.
Read the value back after changing it; increment/decrement has **not** yet been
exercised — see `docs/admin/development-notes.md`.

### Variant grid (V 2026-09-03)

| Part | Selector |
|---|---|
| axis block | `[class*="sku-item--property--"]` |
| axis title (carries the selected value, e.g. `Color: black`) | `[class*="sku-item--title--"]` |
| option | `[class*="sku-item--box--"]`, `[class*="sku-item--image--"]` |
| **selected** option | class contains `sku-item--selected--` |

⚠️ **Option labels are not unique.** The fixture's ten colour options include `black`
twice and `Mix 2pcs` three times. A variant cannot be identified by label — resolve to
`skuId` or to the option's index within its axis, then confirm via
`sku-item--selected--` **and** the rendered price.

## Cart page  (V 2026-09-04)

Host: `https://www.aliexpress.com/p/shoppingcart/index.html`.

**The cart page does not follow this file's `module--element--hash` rule.** Verified
2026-09-04: a sweep for `prefix--element--` names over the whole populated cart page
returned exactly one (`Categoey--lv1Item`, AliExpress's own typo). The cart is built
from the Comet design system plus short per-build hashes (`_3mPKP`). So the anchors
here are **unhashed semantic classes and `aria-label`**, not `[class*="prefix--"]`.
Do not carry the product-page rule over to this page.

### Structure

`.cart-product` is one cart line. Inside it:

| Part | Selector |
|---|---|
| line container | `.cart-product` (also carries `activity_cart_product`) |
| line body / checkbox scope | `.cart-product-body` |
| info column | `.cart-product-info` |
| quantity column | `.cart-product-block-action-wrapper` |
| title | `[class*="cart-product-name"]` |
| variant / SKU text | `[class*="cart-product-sku"]` |
| seller group header | `.group-title-ctn` |

### Controls (all `aria-label`-anchored — the most durable handles on this page)

| Action | Selector | Note |
|---|---|---|
| quantity − | `[aria-label="decrease"]` | **a `DIV`, not a `button`** |
| quantity value | `input[aria-label="number"]` (`.comet-v2-input-number-input`) | |
| quantity + | `[aria-label="increase"]` | **a `DIV`, not a `button`** |
| stepper wrapper | `.comet-v2-input-number` | |
| delete one line | `[aria-label="delete product"]` (`.cart-product-name-ope-trashCan`) | opens a confirm modal |
| add to wishlist | `[aria-label="add to wishlist"]` | |
| find similar | `[aria-label="find similar"]` | |
| checkout CTA | `button.cart-summary-button` | unhashed; label `Checkout (N)` |
| delete selected | `div.cart-header-delete-btn` | **a `DIV`, not a `button`** — a button/role search misses it |

### Checkboxes — three scopes, one aria-label

All three carry `aria-label="unselect product"` when ticked, so **the label cannot tell
you the scope**. Scope by ancestor:

| Scope | Ancestor |
|---|---|
| select all | `.cart-header-checkbox-wrap` |
| seller group | `.group-title-ctn` |
| one line | `.cart-product-body` |

The input is `input.comet-v2-checkbox-input` inside `label.comet-v2-checkbox`; the
checked state also shows as `comet-v2-checkbox-checked` on the label.

### Remove confirmation modal  (V 2026-09-04)

Clicking `[aria-label="delete product"]` opens: title `Remove product`, body
`Remove item from cart?`, buttons `Remove` (primary) and `Cancel`.

⚠️ **`[class*="comet-v2-modal"]` matches 7 nested elements for ONE modal** (mask, wrap,
modal, close, content, body, footer). Counting matches will tell you there are seven
dialogs open. Scope to `.comet-v2-modal-wrap`, and take the buttons from
`.comet-v2-modal-footer`.

### Counts and totals

| Thing | Marker |
|---|---|
| line count | body text `Cart (N)` and `Checkout (N)` |
| subtotal | body text `Subtotal US $X` |
| estimated total | body text `Estimated total US $X` |
| empty state | body text `Your cart is empty`, `Checkout (0)`, `Estimated total US $0.00` |

⚠️ **`Cart (N)` / `Checkout (N)` count LINES, not units.** Verified 2026-09-04: taking
one line from qty 1 → 2 moved the subtotal $1.44 → $2.88 and left both labels reading
`(1)`. An earlier note in this file suggested `Checkout (N)` cross-checks a selected
*item* count — it does not. Cross-check it against `export-cart`'s line count.

⚠️ **The cart badge `[class*="shop-cart--number--"]` is unreliable.** Verified
2026-09-04: it read `...` continuously for minutes after an add — on the product page
*and* on the cart page itself, while the cart genuinely held the item. It is a
loading placeholder that does not always resolve. **Never gate on the badge.** Read
`Cart (N)` or diff `.cart-product` elements.

Line order is **newest-first**: the most recently added item is `.cart-product[0]`.
Identify a line by title or SKU, never by index.

## Order confirmation page  (V 2026-09-04)

### Two ways in, two URL shapes

| Route | Query shape |
|---|---|
| Buy Now (single item) | `objectId=<itemId>&skuId=<skuId>&skuAttr=...&quantity=1&countryCode=IL&...&aeOrderFrom=main_detail` |
| Cart checkout | `availableProductShopcartIds=<cartLineId>&aeOrderFrom=main_shopcart&spm=a2g0o.cart.0.0` |

Verified 2026-09-04: clicking `button.cart-summary-button` produced
`?availableProductShopcartIds=11004259953000&aeOrderFrom=main_shopcart`. The cart route
identifies lines by **cart line id**, not by item/sku — so a confirm URL captured from
one route cannot be rebuilt from the other route's identifiers.

### Reader script

`skills/open-checkout/scripts/read-confirm-page.js` parses this page into JSON and
redacts at source (no street address, no customs ID, no payment instrument). Verified
end to end 2026-09-04; it returned `summarySource: "pl-summary__item-pc (4) +
pl-order-toal-container__item (1)"`, i.e. both blocks resolved. Prefer it to ad-hoc
parsing.



Host: `https://www.aliexpress.com/p/trade/confirm.html`.

**The final button is labelled `Pay now`** — not "Place order". The fine print beneath
it reads *"Upon clicking 'Place Order', I confirm I have read and acknowledged all
terms and policies"*, naming a button the page does not have. Match `Pay now` first,
and keep `place order|submit order|בצע הזמנה` as fallbacks.

Reached by clicking Buy now, **or constructed directly** — the whole order is in the
query string:

```
/p/trade/confirm.html?objectId=<itemId>&skuId=<skuId>&skuAttr=14%3A193%23black
  &quantity=1&countryCode=IL&provinceCode=910000060000000000
  &cityCode=910000060006000000&shippingCompany=CAINIAO_FULFILLMENT_STD_PRE_SG
  &aeOrderFrom=main_detail
```

Blocks observed on the page, top to bottom: Shipping address, **Customs information**
(masked national ID — never read, echo or fill it), Payment Methods, the item block
with its own quantity stepper, then the Summary panel.

Summary rows are label-anchored: `Subtotal`, `Promo codes`, `Shipping fee`, `Bonus`,
`Total`. On the test fixture these read $1.44 / $1.99 / **−$3.43** / **$0.00** — a
platform credit can zero the total, so a total alone does not tell you whether money
or credit is being spent. **There was no tax/VAT row**, i.e. Israeli VAT was not
collected at checkout for this order.

Parse by label rather than by class; the layout is A/B tested. Poll until the total
stops changing before reading, since it arrives after the item rows.

## Cart

The cart is **not** in the DOM at all — it arrives by JSONP script injection and is
read out of page state. See `skills/export-cart/reference.md`; no selectors apply.


## Payment result page  (V 2026-09-04)

Host: `https://www.aliexpress.com/p/second-payment/pay-result.html?pmntId=<paymentId>`

Reached by clicking `Pay now`. The `pmntId` is a **payment** id, not an order id.

| Thing | Marker |
|---|---|
| success | body text `Payment Successful` + `Thank you! We've received your payment.` |
| go to the order | `button` labelled `Check order` (`comet-btn comet-btn-primary`) |
| home | `button` labelled `Home` |

⚠️ **No order id appears on this page.** A sweep for 16–20 digit runs returned
nothing. Do not wait for one here — the id lives on the order pages below.

⚠️ **`Check order` opens a NEW TAB.** The originating tab stays on the pay-result
page. Re-read the tab list after clicking; acting on the old tab id silently reads
the wrong page.

⚠️ **This page renders the full shipping address**, including street and apartment.
Anything reading it must drop those lines at source and keep city + country only.

A useful independent confirmation: the header cart count drops to `0` once the order
is placed, since the purchased lines leave the cart.

## Orders list  (V 2026-09-04)

Host: `https://www.aliexpress.com/p/order/index.html`

Like the cart, this page does **not** use `module--element--hash` naming. Anchors are
plain unhashed classes.

| Thing | Selector |
|---|---|
| one order card | `.order-item` |
| card header | `.order-item-header` |
| status | `.order-item-header-status` |
| action row | `.order-item-btns` / `.order-item-btns-wrap` |
| one action | `.order-item-btn` (a `comet-btn`) |
| order ids | `a[href*="orderId="]` → `/orderId=(\d+)/` |

The order id is labelled **`Ref. Number:`** on screen, not "Order ID" — match the
number, not the phrase you expect. It also parses out of body text with
`/Ref\. Number:\s*(\d+)/`.

Status tabs: `View all`, `To pay (N)`, `Processing (N)`, `Processed (N)`, `Completed`.

⚠️ **The list lags the detail page.** Immediately after a cancellation the list still
showed `Processing` for an order whose detail page already read `Canceled`. Treat the
detail page as authoritative for one order's status.

⚠️ **There is no cancel control on the list.** Processing cards offer only
`Edit address`; cancelled cards offer `Add to cart` and `Remove`.

## Order detail  (V 2026-09-04)

Host: `https://www.aliexpress.com/p/order/detail.html?orderId=<orderId>`

| Thing | Selector / marker |
|---|---|
| order id | `orderId` query param, and body `Ref. Number: <id>` |
| status block | `.order-status` / `.order-status-box` / `.order-status-content` |
| status detail line | `.order-status-info` |
| summary labels | body text `Subtotal`, `Total`, `Order placed on:`, `Paid on:`, `Payment method:` |

### Action row by status

| Status | Buttons observed |
|---|---|
| `Processing` | `Edit address`, `Extend time`, `Receipt`, **`Cancel`**, `Copy`, `Add to cart`, `Collect` |
| `Canceled` | `Add to cart`, `Refund information`, `Copy` |

**The cancel control is labelled `Cancel`, not "Cancel order"**, and it is a
`button.comet-btn` on the **detail** page only. A skill matching `/cancel order/`
finds nothing.

⚠️ **`Cancel` arrives late.** Read ~4 s after load on a freshly placed order, the
action row came back without it; the same row on a settled Processing order carried
it. Do not conclude an order is uncancellable from one early read — re-read after the
page settles.

Post-cancellation the status block reads `Canceled` +
`Your order has been cancelled successfully.`

---

## Verification log

| Date | Fixture | Session | Result |
|---|---|---|---|
| 2026-09-04 | items `1005012170805147`, `1005012995479364`; populated cart; cart-route confirm page | EN/USD, signed in, Chrome | **Root-caused the open `add-to-cart` defect**: not a selector fault but a coordinate-space mismatch (page 2133×1003 vs screenshot 1425×712) that makes `computer` `ref` clicks land on the wrong element — `ref` click 0 requests, `element.click()` 17. Cart populated for the first time, unblocking the whole cart map: quantity stepper (`aria-label` decrease/number/increase), per-line trash, remove-confirm modal, select-all/group/line checkbox scopes, `div.cart-header-delete-btn`. Corrected two premises: `Checkout (N)` counts lines not units, and the cart badge is an unreliable `...` placeholder. `read-confirm-page.js` validated live. | Order placed end to end and the post-purchase surface mapped for the first time: pay-result page (`pmntId`, no order id, opens a new tab), orders list (`.order-item`, `Ref. Number:`), order detail (`orderId` param, `Cancel` label, status-dependent action row). |
| 2026-09-01 | `USB-C cable` search, `he.aliexpress.com` | EN/USD, signed in, Chrome | 5 confirmed V · 1 genuine break (card price → replaced with innerText parse) · 1 inconclusive (`PremiumQuality`) · locale premise disproved · staged-hydration gate added. Product page (delivery panel, spec table, review chips) **not yet probed** — still `U`. |
| 2026-09-03 | items `1005012170805147`, `1005012995479364`; cart page; confirm page | EN/USD, signed in, Chrome | Write paths captured live and promoted `U` → `V`: product CTA row (unhashed `add-to-cart` / `buy-now` prefixes), quantity stepper, variant grid incl. `sku-item--selected--`, cart empty state and `Checkout (N)`, confirm page incl. the `Pay now` label correction and the constructible confirm URL. Two premises corrected: the final button is not "Place order", and variant labels are not unique. **Still uncaptured:** per-line remove, select-all, batch delete — cart could not be populated (see open defects). |
