# AliExpress Israel Skills

A Claude Code plugin of AliExpress shopping skills built for an **Israel-based
buyer**: prices in ILS, the site pinned to the Israel channel, Choice-first search,
Israeli-buyer review filtering, shipping-lane evaluation for Israel, and the $75
customs de-minimis treated as a first-class concern throughout.

Skills drive AliExpress in **the user's own Chrome** via Claude-in-Chrome. Headless
routes are fallbacks, not the default — see
[`reference/browser.md`](reference/browser.md).

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
- `export-cart` — read the live signed-in cart into JSON/CSV. Feeds `cart-vat-nudge`
  directly. Read-only by design.

**Maintenance**

- `selector-verification` — probe the live DOM against every selector in
  `reference/selectors.md` and report what still works. Uses a fixed fixture query
  (`USB-C cable`) so a change in the result means a change in the site. Admin skill;
  not for shopping.

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
