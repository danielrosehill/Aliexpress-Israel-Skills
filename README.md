# AliExpress Israel Skills

A Claude Code plugin of AliExpress shopping skills built for an **Israel-based buyer**: prices in ILS, the site pinned to the Israel/Hebrew channel, **Choice-first** search, Israeli-buyer review filtering, single-listing landed-cost parsing, and a running **cart-value VAT nudge** around Israel's $75 de-minimis.

The search / review skills drive AliExpress in a **local, visible browser** via Playwright (headless gets challenged). `fetch-listing` uses a no-auth scraper for a single URL.

## Skills

- `search-aliexpress` — search from an IL buyer's view (ILS, Hebrew channel). Choice is the default filter; free-shipping / 4★ / ship-from (IL/CN/TR) compose on top. Returns a shortlist of product cards.
- `free-shipping-only` — thin preset over `search-aliexpress` that forces the server-side free-shipping-to-IL filter and verifies it applied.
- `il-reviews-show` — on a product page, filter reviews down to Israeli buyers only (stars, variant, photos, text, date).
- `fetch-listing` — parse a single listing/URL into structured JSON with an Israel-aware landed cost (price + ship-to-IL fee + VAT band).
- `cart-vat-nudge` — track a running cart total in USD and nudge as it nears/crosses Israel's **$75 VAT-free de-minimis** (where ~18% VAT starts applying to the whole order).

## The $75 de-minimis, in one line

Goods value ≤ $75 → tax-free. Above it, ~18% VAT applies to the **entire** order, so crossing the line by a couple of dollars can add ~$14+ of tax. `cart-vat-nudge` catches that cliff and suggests trimming or splitting the order.

> Thresholds and the VAT rate change from time to time — the skills tell you to verify at runtime rather than trusting a baked-in number.

## Relationship to other plugins

- A slimmer, browser-extension-driven approach lives in `Aliexpress-Shopper` (Claude-in-Chrome + userscripts). This plugin is the **Playwright-driven, Israel-context** counterpart.
- These skills originated inside the broader `israel-shopping` skill collection and are extracted here so AliExpress is standalone, separate from Israeli local-retailer / Zap comparison skills.

## Installation

```bash
claude plugins install aliexpress-israel-skills@danielrosehill
```

## License

MIT © Daniel Rosehill
