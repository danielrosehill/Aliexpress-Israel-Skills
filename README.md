# AliExpress Israel Skills

A Claude Code plugin of AliExpress shopping skills built for an **Israel-based buyer**: prices in ILS, the site pinned to the Israel/Hebrew channel, **Choice-first** search, Israeli-buyer review filtering, single-listing landed-cost parsing, and a running **cart-value VAT nudge** around Israel's $75 de-minimis.

The search / review skills drive AliExpress in a **local, visible browser** via Playwright (headless gets challenged). `fetch-listing` uses a no-auth scraper for a single URL. `export-cart` reads the signed-in cart out of page state, with a signed-API fallback for unattended runs.

## Skills

- `search-aliexpress` — search from an IL buyer's view (ILS, Hebrew channel). Choice is the default filter; free-shipping / 4★ / ship-from (IL/CN/TR) compose on top. Returns a shortlist of product cards.
- `search-by-synonyms` — for products that hide under many names: rotate keyword mutations (plain / trade / function / CN-marketplace / material terms) over `search-aliexpress`, dedupe by item id, and filter hard on the one defining spec (usually a dimension). Beats a single query for hard-to-name commodity items.
- `search-by-image` — reverse-image search: upload a product photo to AliExpress's own visual search (camera icon) via the browser and return IL-context cards. For items keyword search can't find (industrial parts/bins, odd shapes). The picture-side complement to `search-by-synonyms`. (The official AliExpress API doesn't expose consumer image search — the site's visual search, browser-driven, is the route.)
- `free-shipping-only` — thin preset over `search-aliexpress` that forces the server-side free-shipping-to-IL filter and verifies it applied.
- `hunt-pricing-anomaly` — on a multi-variant listing, find where price doesn't scale with volume/quantity: computes ₪-per-litre per size and reads bulk tiers, so a disproportionately-cheap large size or quantity break surfaces. Verifies the win **landed** in IL.
- `il-reviews-show` — on a product page, filter reviews down to Israeli buyers only (stars, variant, photos, text, date).
- `fetch-listing` — parse a single listing/URL into structured JSON with an Israel-aware landed cost (price + ship-to-IL fee + VAT band).
- `export-cart` — read the **live signed-in cart** into structured JSON/CSV: items, SKUs, quantities, per-unit and crossed-out prices, sellers, per-item shipping, and which lines are ticked for checkout. Feeds `cart-vat-nudge` directly. Read-only by design.
- `cart-vat-nudge` — track a running cart total in USD and nudge as it nears/crosses Israel's **$75 VAT-free de-minimis** (where ~18% VAT starts applying to the whole order). Takes hand-assembled items, or `export-cart`'s output for the real cart.

## The $75 de-minimis, in one line

Goods value ≤ $75 → tax-free. Above it, ~18% VAT applies to the **entire** order, so crossing the line by a couple of dollars can add ~$14+ of tax. `cart-vat-nudge` catches that cliff and suggests trimming or splitting the order.

> Thresholds and the VAT rate change from time to time — the skills tell you to verify at runtime rather than trusting a baked-in number.

## Why reading the cart needed its own skill

The AliExpress cart is neither in the page HTML nor fetched by `fetch`/XHR — it arrives via **JSONP script injection** from a single signed endpoint (`mtop.aliexpress.trade.cart.render`). So scraping the cart markup returns nothing, and a network panel shows no API call for it. `export-cart` reads the already-parsed payload out of page state instead, which needs no signing at all.

Protocol notes, the signing algorithm and failure triage are in `skills/export-cart/reference.md`; the full reverse-engineering write-up lives in the private `Aliexpress-Cart-Analysis` repo.

## Relationship to other plugins

- A slimmer, browser-extension-driven approach lives in `Aliexpress-Shopper` (Claude-in-Chrome + userscripts). This plugin is the **Playwright-driven, Israel-context** counterpart.
- These skills originated inside the broader `israel-shopping` skill collection and are extracted here so AliExpress is standalone, separate from Israeli local-retailer / Zap comparison skills.

## Installation

```bash
claude plugins install aliexpress-israel-skills@danielrosehill
```

## License

MIT © Daniel Rosehill
