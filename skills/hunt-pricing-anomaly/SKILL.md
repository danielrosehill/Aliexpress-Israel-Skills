---
name: hunt-pricing-anomaly
description: On a multi-variant AliExpress listing, find pricing anomalies — where price doesn't scale with volume or quantity, so a bigger size or a bulk tier is disproportionately cheap. Computes ₪-per-litre per variant and reads quantity tiers.
---

# Hunt Pricing Anomaly

Many AliExpress listings reuse **one price across several sizes/variants**, or hide a
steep **bulk tier**. That means the *biggest* variant, or a quantity break, can be
disproportionately cheap — you get far more product per shekel without paying
proportionally more. This skill finds those anomalies on a listing.

## When to use

- A listing has a **size / capacity dropdown** (multiple SKUs under one item).
- You're buying a commodity where more volume is strictly better (storage boxes,
  bulk consumables) and want the best ₪-per-unit-of-stuff, not the lowest sticker.
- Downstream of `search-by-synonyms` / `search-aliexpress` on a shortlisted item.

## The anomalies to catch

1. **Flat price across sizes (per-volume anomaly).** The classic. A "Big" variant
   priced ~the same as the small one. Compute **₪ per litre** for every SKU; the
   cheapest ₪/L wins, and it's usually the largest size.
2. **Steep quantity tier (per-quantity anomaly).** "Buy 2+ / 5+ / 10+" drops the
   unit price sharply. A 10–20 unit order then lands far below 10× the single price.
3. **Discount that only applies at one variant/qty.** A −30/−38% badge that holds
   only for a size you don't want (or evaporates at the qty you'd buy). Verify at the
   actual size×qty you'd purchase.

## Method

1. **Enumerate SKUs.** Open the listing (locale = ILS/Hebrew per `search-aliexpress`
   cookie setup) and read every size/variant option with its price. If the size grid
   is JS-gated and won't scrape, drive it in the **visible browser** (Playwright),
   clicking each dropdown option and reading the updated price — the price XHR is
   anti-bot-protected for headless/fetch, so a real browser is required.
2. **Normalize.** For each SKU, parse dimensions → **volume in litres**
   (`L×W×H in cm ÷ 1000`), and compute **₪/L**. For non-volume goods, normalize on
   the natural unit (per metre, per 100 pcs, etc.).
3. **Read quantity tiers.** Capture any qty-break table (thresholds + unit price).
4. **Flag anomalies.** Rank SKUs by ₪/L (or natural unit). Call out any where a
   larger size is within ~10% of a smaller one's price, and any qty tier that beats
   the 1-unit price by a meaningful margin.
5. **Landed check.** Add ship-to-IL + VAT band via `fetch-listing` logic at the
   winning size×qty — the anomaly only matters if it survives *landed* in Israel.

## Output format

```
Listing: <title>   item <id>
Locale: ILS verified

Per-variant (sorted best ₪/L first):
  size            price     volume    ₪/L
  60×40×34 cm     ₪78.00    81.6 L    0.96   ★ cheapest per litre
  60×40×23 cm     ₪71.00    55.2 L    1.29
  40×30×15 cm     ₪69.00    18.0 L    3.83

Quantity tiers (if any):
  1+   ₪78.00   ·   5+   ₪69.00   ·   10+   ₪61.00   ← −22% vs single

Anomalies:
  • "60×40×34" priced within 10% of "60×40×23" but +48% volume → take the tall one.
  • 10+ tier −22%: a 10-unit order ≈ ₪610 vs ₪780 at single price.

Landed at winning SKU (60×40×34 ×10, ship→IL): ₪<x> incl. VAT band <…>
Beats local? local rigid 60×40 w/ lid ≈ ₪80 → compare per-box landed.
```

## Composition

- Consumes a listing shortlisted by `search-by-synonyms` / `search-aliexpress`.
- Uses `fetch-listing` for the landed-cost + VAT band at the chosen SKU.
- Feed the running total to `cart-vat-nudge` if buying several.

## Validation checklist

1. Every visible SKU was read (not just the default), with a price each.
2. ₪/L (or the natural per-unit metric) is computed for each — not just sticker price.
3. Quantity tiers reported (including "none found").
4. The winning pick is compared **landed in Israel**, not on sticker alone.
