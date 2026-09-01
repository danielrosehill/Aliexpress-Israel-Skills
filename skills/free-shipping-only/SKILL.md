---
name: free-shipping-only
description: Search AliExpress showing only listings with free shipping to Israel (server-side freeshipping filter). Thin preset over search-aliexpress.
---

# Free Shipping Only

Search with the `Free shipping` chip pre-applied. Thin preset over
`search-aliexpress` — it inherits the Chrome-first route, the locale handshake and
every other filter.

## Inputs

- `query` (required)
- `choice`, `rating4plus`, `premium`, `ship_from` — pass through, compose with
  `freeshipping=true`
- `max_results` (optional, default 20)

## How it differs from `search-aliexpress`

- Forces `filters.freeshipping = true` regardless of caller input.
- **Verifies the chip actually applied** before scraping. Some queries return zero
  free-shipping listings, in which case the click produces no visible change — that
  must be detected and reported, not read as "no filter needed".

Chip selector and the assert-after-re-render pattern:
`$CLAUDE_PLUGIN_ROOT/reference/selectors.md`. If `aria-checked` is still `false`
after a wait and one retry, bail with a clear error.

## What "free shipping" actually means here

The chip is AliExpress's own server-side flag: listings where the **seller** marked
the item free-shipping to the *current* ship-to region (IL, anchored by `region=IL`).
It does **not**:

- **Cover customs/VAT.** Israeli thresholds still apply — see
  `$CLAUDE_PLUGIN_ROOT/reference/israel-tax.md`. Use `find-under-75` to hunt inside
  the exemption, `cart-vat-nudge` to track a basket against it.
- **Guarantee reasonable delivery.** "Free" in AliExpress parlance usually means the
  cheapest and slowest carrier. **This skill filters on the flag; it does not
  evaluate the lane.** For actual carrier, cost-of-time and lead-time comparison run
  `ship-options-il` on the finalists.
- **Hold per variant.** The flag is listing-level. A heavier variant can carry a
  shipping charge the chip never saw.
- **Reflect conditional shipping** ("free over $X") — those listings are typically
  excluded by the chip rather than included.

State these once at the top of the result block so the user doesn't read "free
shipping" as "no other costs and it'll be here next week".

## Output format

```
Free-shipping filter: ON (verified via aria-checked)    Route: claude-in-chrome
Region: IL (from aep_usuc_f.region)
…standard search-aliexpress results block…

Note: "free shipping" = seller-paid carrier to IL, listing-level, often the slowest
lane. Customs/VAT still apply above the IL de minimis. Run `ship-options-il` to see
what the free lane actually is.
```

## Composition

- `+ choice=true` → free-shipping Choice listings (the fastest free option)
- `+ ship_from=IL` → free **and** dispatched inside Israel (days, but small selection)
- `→ ship-options-il` → what the free lane actually costs in time
- `→ find-under-75` → free shipping plus the item-price ceiling and landed check
- `→ il-reviews-show` (per click-through) → IL reviews on each survivor

## Validation checklist

1. Locale handshake verified (`c_tp=ILS`, `b_locale=iw_IL`, `region=IL`).
2. Chip wrapper reads `aria-checked="true"` after the click and re-render.
3. Result count reported — including `0`, which is meaningful (nothing on AE ships
   free to IL for this query right now).
4. The caveat block is present in the output.
