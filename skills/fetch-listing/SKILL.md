---
name: fetch-listing
description: Parse one AliExpress listing into a structured summary with the Israel landed cost — price, ship-to-IL fee, lead time, ratings, seller trust signals, VAT band.
---

# Fetch AliExpress Listing

Turn a single listing into a structured record plus a one-screen summary, with an
Israel-aware landed-cost calculation.

## When to use

- The user has a **specific** AliExpress URL or item id and wants price, shipping,
  ratings and landed cost in one place
- On finalists from `search-aliexpress` / `search-by-synonyms` / `search-by-image`
- Before feeding a basket to `cart-vat-nudge`

For shipping **options and trade-offs** rather than a single landed figure, use
`ship-options-il` — it opens the delivery panel and compares lanes. This skill takes
one lane and prices it.

## Inputs

- `id_or_url` (required) — item id (`1005007520167230`) or full URL
- `locale` (optional, default `he-IL`) — `he-IL` (Hebrew/ILS) or `en-US` (English/USD)
- `qty` / `sku` (optional) — price a specific variant and quantity

## Route A — the user's own Chrome (default)

Open the listing, do the locale handshake, read the rendered page. See
`$CLAUDE_PLUGIN_ROOT/reference/browser.md`. This is the route that reflects what the
user would actually be charged, because it uses their session, their ship-to country
and their live promo eligibility.

Read from the page:

| Field | Source |
|---|---|
| title, item id | page heading / URL |
| price, crossed price | price block — **`₪` glyph confirms locale took** |
| variants / SKUs | size-colour grid (JS-gated; click to read updated price) |
| shipping fee + lead time | delivery panel — see `ship-options-il` |
| rating, review count | reviews header |
| store name, seller signals | store card |

**Promo prices expire.** Record the read timestamp with the price; a figure quoted
three days later is not the figure at checkout.

## Route B — headless scraper (batch / unattended)

⚠️ **The script this route needs is not currently in the repository.** Earlier
revisions of this skill documented `scripts/ali-fetch.mjs`, a `package.json` and an
`npm install` step; none of those files exist here. Do not tell the user to run it.
Until it is written, Route A is the only working route.

If Route B is rebuilt, the design that was documented for it:

- `aliexpress-product-scraper` + Puppeteer on Node ≥ 24
- writes `listing-<id>.json`; caches USD/ILS in `.fx-cache.json` (24h TTL)
- `data.shipping[]` — pick the entry with `shippingInfo.toCode === "IL"`; if absent,
  fall back to `shipping[0]` and **warn**, because that is another country's rate
- the upstream scraper mislabels currency: it sometimes reports `currency: "USD"`
  when the amount is ILS. Prefer `formatedAmount` (the localized string with the
  glyph) over the `currency` field
- an empty `data.title` means the scraper failed silently — rate-limit or DOM
  rotation, not an empty listing
- fallbacks if it breaks: `omkarcloud/aliexpress-scraper`, `oxylabs/aliexpress-scraper`

## Landed cost and VAT band

Bands, the FOB/CIF distinction, the cliff, and the FX rule (live frankfurter rate,
`USD_ILS` override, **stop rather than guess**) are all in
`$CLAUDE_PLUGIN_ROOT/reference/israel-tax.md`.

Surface **both** the bare landed cost (item + shipping) and the VAT-inclusive cost,
and name the band. Do not collapse them into one number — which one applies depends
on whether this item ships alone.

## Seller trust signals

Cheap and unusable is not a saving. Read and report, rather than making the user
open the store page:

- **Store rating** and **feedback count** — a 4.9 on 12 orders is not a 4.9 on 12,000
- **Store age** — very new stores carry more risk on higher-value items
- **Top Rated / Choice** — Choice implies AliExpress-run logistics and an easier
  dispute path
- **Rating vs IL reviews** — a strong global rating with zero IL reviews means nobody
  has proven this ships here. Run `il-reviews-show`.

Flag, don't veto: say what the signal is and let the user weigh it.

## Output format

```
Listing: <title>                       item <id>
Route: claude-in-chrome                read at <timestamp>
price: ₪72.10  (was ₪118.00)           variant: <sku or default>
orders: 0      rating: 4.2 (25)        IL reviews: <n or "not checked">
ship:  China → Israel   fee: ₪7.49   lead: 10–30 days   lane: <name>
store: <name>   rating <x> (<n>)   age <y>   topRated: false
fx: 1 USD = ₪2.9798 (frankfurter@2026-04-24)

landed (item+ship): ₪79.59  = $26.71    VAT: none    band: under-$75 (exempt)
                                        ⚠ band applies to THIS item shipped alone
Next: `ship-options-il` to compare lanes · `il-reviews-show` before buying ·
      `cart-vat-nudge` if this joins other items in one order
```

## Out of scope

Search (`search-aliexpress`) · shipping-lane comparison (`ship-options-il`) · running
cart total (`cart-vat-nudge`) · reading the real cart (`export-cart`) · order
placement or tracking (never).

## Validation checklist

1. Currency verified as ₪ from the rendered page — a USD figure reported as ILS is
   the worst failure available here.
2. The shipping figure is for **Israel**, confirmed, not a default-country rate.
3. FX rate printed with source and date; the skill stopped rather than guessing if
   the rate was unavailable.
4. Both bare landed and VAT-inclusive shown, with the band named.
5. The per-shipment caveat is present — the band is for this item alone.
6. Seller signals reported, including whether IL reviews exist.
7. The read timestamp is shown alongside a promo price.
