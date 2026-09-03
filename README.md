# AliExpress Israel Skills

A Claude Code plugin of AliExpress shopping skills built for an **Israel-based
buyer**: prices in ILS, the site pinned to the Israel channel, Choice-first search,
Israeli-buyer review filtering, shipping-lane evaluation for Israel, and the $75
customs de-minimis treated as a first-class concern throughout.

Skills drive AliExpress in **the user's own Chrome** via Claude-in-Chrome. Headless
routes are fallbacks, not the default — see
[`reference/browser.md`](reference/browser.md).

As of v1.6.0 the bundle is **no longer read-only**: it can add to the cart, read the
real checkout page, and place an order behind a confirmation gate. What each skill is
allowed to do is set by the [write-action ladder](#write-actions) rather than by a
blanket rule.

## The three ways an AliExpress order fails for an Israeli buyer

The bundle is organised around them:

| Failure | Skills |
|---|---|
| **It gets taxed** — crosses the $75 de-minimis and picks up 18% VAT on the whole order | `find-under-75`, `cart-vat-nudge`, `fetch-listing` |
| **It doesn't arrive, or takes two months** | `ship-options-il`, `free-shipping-only`, `il-reviews-show` |
| **It arrives and can't be used** — wrong plug, wrong voltage, restricted category | `check-il-compatibility` |

Finding the thing in the first place: `search-aliexpress`, `search-by-synonyms`,
`search-by-image`, `hunt-pricing-anomaly`. Working with a real basket: `export-cart`.

## Skills

**Finding**

- `search-aliexpress` — search from an IL buyer's view (ILS, Israel channel). Choice
  is the default filter; free-shipping / 4★ / ship-from (IL/CN/TR) compose on top.
- `search-by-synonyms` — products hide under many names. Rotates keyword mutations
  (plain / trade / function / CN-marketplace-literal / material) over
  `search-aliexpress`, dedupes by item id, then filters hard on one defining spec.
- `search-by-image` — reverse-image search via AliExpress's own visual search, for
  items keyword search can't reach (industrial parts, odd shapes).
- `free-shipping-only` — thin preset forcing the server-side free-shipping-to-IL
  filter, and verifying it applied.
- `hunt-pricing-anomaly` — on a multi-variant listing, find where price doesn't scale
  with volume or quantity. Computes ₪-per-litre per size and reads bulk tiers.

**Evaluating**

- `ship-options-il` — opens the delivery panel and reads *every* lane to Israel:
  carrier, cost, lead time, tracking. Computes the cost of time (₪ per day saved) and
  recommends one. The collapsed shipping row is not the menu.
- `check-il-compatibility` — will it actually work here? Type H sockets, 230 V / 50 Hz,
  dual-voltage vs 110 V-only, plug variants, restricted-import categories.
- `il-reviews-show` — filter a listing's reviews to Israeli buyers only. Confirms the
  item genuinely ships here and how long it really took.
- `fetch-listing` — one listing → structured record with landed cost, VAT band and
  seller trust signals.

**Tax position**

- `find-under-75` — hunt for items that land tax-free: item ≤ $70, free shipping to
  IL, verified landed cost < $75. Reports CLEAR / TIGHT / OVER with the FX-break rate.
- `cart-vat-nudge` — running cart total against the $75 line, with the cliff penalty
  and mitigation when it's crossed.
- `export-cart` — read the live signed-in cart and write it out as **JSON, CSV and
  Markdown** (`--format all`). Feeds `cart-vat-nudge` directly. Does not mutate the
  cart. Files land in the user-data root, not the repo.

**Buying** — the write path, see [below](#write-actions)

- `add-to-cart` — add one listing, one SKU, one quantity to the real cart, then prove
  it landed by **diffing the cart** rather than trusting the success toast. Tier 2:
  reversible, no money.
- `open-checkout` — open the order-confirmation page and read the *committed* numbers:
  the shipping lane actually selected, coupons that only apply at checkout, and
  whether AliExpress collects Israeli VAT there. Reconciles against the estimate and
  **stops** — nothing is ordered.
- `buy-now` — place one real order behind a two-stage gate: terms presented in full,
  turn ends, and the confirmation phrase must carry the exact total. Never touches a
  payment credential, an OTP or 3-D Secure. Tier 3.

**Maintenance**

- `selector-verification` — probe the live DOM against every selector in
  `reference/selectors.md` and report what still works. Uses a fixed fixture query
  (`USB-C cable`) so a change in the result means a change in the site. Admin skill;
  not for shopping.

## Write actions

The read-only rule that governed v1.0–v1.5 is replaced by a ladder graduated on
consequence. Full text in [`reference/browser.md`](reference/browser.md).

| Tier | Consequence | Skills | Gate |
|---|---|---|---|
| 1 | reads only | everything else, incl. `export-cart` and `open-checkout` | none |
| 2 | reversible, no money | `add-to-cart` | act on a clear instruction |
| 3 | **spends money** | `buy-now` | terms presented, turn ended, exact confirmation phrase |

Three rules apply to tiers 2 and 3 and are the reason they are safe to ship on
unverified selectors:

- **Verify the effect, not the click.** The success toast, the cart badge and an HTTP
  200 have all been observed to lie on this site. `add-to-cart` diffs the cart;
  `buy-now` re-reads the total, and on an unreadable outcome reads the orders page.
- **One click, never a blind retry.** Nothing here is idempotent — a second add is a
  second unit, a second placement is a second order. An unknown outcome is resolved by
  reading state, not by repeating the action.
- **Authorization does not accumulate.** Approval to add is not approval to check out;
  one order confirmed is not the next one confirmed.

`buy-now`'s confirmation phrase embeds the total (`PLACE ORDER 82.14 ILS`), so an
authorization cannot outlive the figures it was given: if the price moves between the
terms sheet and the reply, the phrase no longer matches and the flow restarts.

## Shared references

Loaded on demand, so the cost is paid once rather than duplicated in every skill:

- [`reference/browser.md`](reference/browser.md) — route order (Chrome → gateway
  Playwright → headless → fetch), tool mapping, the ILS/Hebrew/ship-to-IL locale
  handshake, and the standing rules (no dialogs, no hashed selectors, captcha is a
  stop).
- [`reference/israel-tax.md`](reference/israel-tax.md) — the bands, the FOB/CIF
  distinction, the cliff arithmetic, the FX rule.
- [`reference/selectors.md`](reference/selectors.md) — every DOM selector with a
  verification status. `V` = verified live, `U` = candidate, capture before trusting.

## The $75 de-minimis, in one line

Goods value ≤ $75 → tax-free. Above it, ~18% VAT applies to the **entire** order, so
crossing the line by a couple of dollars can add ~$14+. It is **per shipment, not per
item** — three qualifying $60 items in one order is $180 of goods and fully taxable.

Thresholds and the VAT rate change; the skills tell you to verify at runtime rather
than trusting a baked-in number.

## Why reading the cart needed its own skill

The AliExpress cart is neither in the page HTML nor fetched by `fetch`/XHR — it
arrives via **JSONP script injection** from one signed endpoint
(`mtop.aliexpress.trade.cart.render`). Scraping cart markup returns nothing, and the
network panel shows no API call for it. `export-cart` reads the already-parsed
payload out of page state instead, which needs no signing at all. Protocol notes,
the signing algorithm and failure triage are in
[`skills/export-cart/reference.md`](skills/export-cart/reference.md); the full
reverse-engineering write-up lives in the private `Aliexpress-Cart-Analysis` repo.

## Known gaps

- **`fetch-listing` Route B is not implemented.** The headless-scraper route
  documents a `scripts/ali-fetch.mjs` that does not exist in this repo. Route A
  (Chrome) works; the skill says so explicitly rather than pointing you at a missing
  file.
- **Delivery-panel and spec-table selectors are still uncaptured** (`U` in
  `reference/selectors.md`). The 2026-09-01 verification run covered the search page
  only; the product page has not been probed. `ship-options-il` and
  `check-il-compatibility` carry text-anchored fallbacks until it is.
- **The `he.` host does not force ILS.** An account set to EN/USD gets English and
  USD on `he.aliexpress.com`. Skills verify the rendered currency rather than trusting
  the hostname — but the currency must currently be switched by hand or by the picker.
- **The write-path selectors are uncaptured** (`U`): the product-page CTA row, the
  cart's checkout button and the order-confirmation page. `add-to-cart`,
  `open-checkout` and `buy-now` locate them by **label text** (English and Hebrew) and
  verify their effect afterwards, so a rotation degrades to a clean failure rather
  than a wrong action — but none of it has been probed live. Promote it on the next
  `selector-verification` run.
- **Nothing in this plugin has been exercised against a real order.** `buy-now`'s gate
  logic and terms sheet are specified but not yet walked end to end; the first live run
  should be on a cheap single item.
- **No local-retailer price comparison.** Deliberate — "is this cheaper than buying
  it in Israel" lives in the separate `israel-shopping` collection alongside the Zap
  comparison skills.

## Relationship to other plugins

- `Aliexpress-Shopper` is a slimmer, browser-extension-driven approach
  (Claude-in-Chrome + userscripts). This plugin is the Israel-context counterpart
  with the tax and logistics reasoning built in.
- These skills originated inside a broader `israel-shopping` collection and were
  extracted so the AliExpress work stands alone.

## Installation

```bash
claude plugins install aliexpress-israel-skills@danielrosehill
```

## License

MIT © Daniel Rosehill
