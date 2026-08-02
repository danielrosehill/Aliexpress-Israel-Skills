---
name: fetch-listing
description: Parse one AliExpress listing into structured JSON with Israel landed cost — price, ship-to-IL fee, lead time, ratings, store, and VAT band.
---

# Fetch AliExpress Listing

Parse a single AliExpress listing into a structured JSON file plus a one-screen summary, with Israel-aware landed-cost calculation.

## When to use

- User has a **specific** AliExpress URL or product ID and wants the price/shipping/ratings broken out
- Downstream of `search-aliexpress` — once a candidate is shortlisted, fetch its full data
- Landed-cost comparison, or feeding a running cart total to `cart-vat-nudge`

For **searching** (no specific URL yet), use `search-aliexpress` instead.

## Inputs

- `id_or_url` (required) — product ID (e.g. `1005007520167230`) or full URL (`https://www.aliexpress.com/item/...html`)
- `--locale` (optional, default `en-US`) — `en-US` (English/USD) or `he-IL` (Hebrew/ILS, set via documented cookies)
- `--out-dir` (optional, default `./outputs`) — where to write the JSON dump

## Setup (one-time per environment)

```bash
nvm use 24      # Node ≥ 24 required
cd "$CLAUDE_PLUGIN_ROOT/skills/fetch-listing/scripts"
npm install     # installs aliexpress-product-scraper + puppeteer
```

Puppeteer downloads its own Chromium on install (~150 MB).

## Usage

```bash
node scripts/ali-fetch.mjs <id|url> [outDir]
```

Outputs:

- `<outDir>/listing-<id>.json` — full structured dump (price, shipping, ratings, reviews, specs, store, variants)
- `<outDir>/.fx-cache.json` — cached USD/ILS rate (24h TTL, frankfurter.app/ECB)
- `stdout` summary — title, price, orders, rating, ship lane + fee + lead time, store, landed cost

## Output format (stdout)

```
wrote outputs/listing-1005007520167230.json
  title: <product title>
  price: ₪72.10
  orders: 0   rating: 4.2 (25)
  ship: China → Israel   fee: ₪7.49   lead: 10–30 days
  store: <store name>   topRated: false
  fx: 1 USD = ₪2.9798 (frankfurter@2026-04-24)
  landed (item+ship): ₪79.59   incl. VAT: ₪79.59   band: under-$75 (no VAT)
```

## Israeli VAT bands

The script computes and surfaces both the bare landed cost (item + shipping) and the VAT-inclusive cost. The user decides which to use for comparisons.

| Item value (USD) | VAT band                            |
|------------------|-------------------------------------|
| ≤ $75            | No VAT                              |
| $75 – $500       | ~18% VAT on (item + shipping)       |
| > $500           | Customs/duty applies (out of scope) |

USD value is computed from the ILS price using the live frankfurter.app rate. Override with `USD_ILS=<rate>` env var if needed. The $75 boundary is the same de-minimis `cart-vat-nudge` watches for a multi-item cart.

## Currency / locale notes

- The upstream scraper sometimes labels prices `currency: "USD"` even when the amount is ILS. The script prefers `formatedAmount` (the localized string with the currency glyph) over the buggy `currency` field.
- Default behaviour returns whatever locale the upstream scraper picks up (typically en-US). Hebrew/ILS via `--locale he-IL` needs cookie injection through Puppeteer (`c_tp=ILS`, `b_locale=iw_IL`).

## Out of scope

- **Search** — use `search-aliexpress`.
- **Running cart total across multiple items** — use `cart-vat-nudge`.
- **Reading what's already in the user's cart** — use `export-cart`.
- **Order placement / tracking** — not supported.

## Validation checklist

1. JSON file written to `<outDir>/listing-<id>.json` and is non-empty.
2. `data.title` is present (empty title indicates the scraper failed silently — usually rate-limit or DOM rotation).
3. `data.shipping[].shippingInfo.toCode === "IL"` exists (or the script falls back to `shipping[0]` and warns).
4. `fx.rate` is a finite number; if frankfurter is unreachable and no `USD_ILS` env override is set, the script aborts.
5. Landed cost prints both `subtotal` and `withVat`; `band` is one of the three documented values.

## Fallback scrapers

If `aliexpress-product-scraper` breaks (DOM rotation, anti-bot challenges):

- `omkarcloud/aliexpress-scraper`
- `oxylabs/aliexpress-scraper`

For long-term reliability, prefer the official AliExpress Affiliate API once configured.
