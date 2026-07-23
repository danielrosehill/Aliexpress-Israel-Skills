---
name: free-shipping-only
description: Search AliExpress showing only listings with free shipping to Israel (server-side freeshipping filter). Thin preset over search-aliexpress.
---

# Free Shipping Only

Search AliExpress with the `Free shipping` filter chip pre-applied. Thin preset over `search-aliexpress`.

## Inputs

- `query` (required)
- Other `search-aliexpress` filters can still be passed through: `choice`, `rating4plus`, `premium`, `ship_from`. They compose with `freeshipping=true`.
- `max_results` (optional, default 20).

## How it differs from `search-aliexpress`

- Forces `filters.freeshipping = true` regardless of caller input.
- Verifies the chip is actually active before scraping (some queries return zero free-shipping listings, in which case the chip click does nothing visible — the skill must detect this).

## Filter mechanics (validated)

Listing-page chip:

```
[aria-label="filterCode:freeshipping"]
```

Click the wrapper `<span>`, not the inner `<input>`:

```js
const chip = document.querySelector('[aria-label="filterCode:freeshipping"]');
if (chip.getAttribute('aria-checked') !== 'true') chip.click();
```

After the click, wait for results to re-render, then assert:

```js
document.querySelector('[aria-label="filterCode:freeshipping"]').getAttribute('aria-checked') === 'true';
```

If `aria-checked` is still `false`, the chip wasn't applied (e.g. zero-result query, captcha, DOM not yet hydrated). Wait once more, retry once, then bail with a clear error.

## What "free shipping" actually means here

The `freeshipping` chip is AliExpress's own server-side flag — it filters to listings where the seller has marked the item as free-shipping to the *current ship-to region* (here, IL, anchored by `region=IL` in the `aep_usuc_f` cookie). It does **not**:

- Cover customs/VAT — Israeli customs/VAT thresholds still apply ($75 USD de minimis for VAT, $500 USD for duty; verify at runtime). Hand a running cart to `cart-vat-nudge` to track this.
- Guarantee fast delivery — "free" in AliExpress parlance often means cheapest/slowest carrier. Choice listings are usually the faster free option.
- Reflect promotional/conditional shipping (e.g. "free over $X") — those listings are typically excluded by this chip rather than included.

Mention these caveats once at the top of the result block so the user doesn't conflate "free shipping" with "no other costs".

## Output format

Same as `search-aliexpress`, with a header line confirming the filter is active:

```
Free-shipping filter: ON  (verified via aria-checked)
Region: IL  (from aep_usuc_f.region)
…rest of standard results block…

Note: "free shipping" = seller-paid carrier to IL. Customs/VAT may still apply
above the IL de minimis (~$75 USD for VAT, $500 USD for duty — verify).
```

## Composition

This skill stacks with the others:

- + `choice=true` → free-shipping Choice listings (fastest free option).
- + `ship_from=IL` → free shipping **and** dispatched from inside Israel (very fast delivery, but small selection).
- + `il-reviews-show` (per click-through) → free-shipping listings, filtered to IL reviews on each one.

## Validation checklist

1. Locale handshake: `c_tp=ILS`, `b_locale=iw_IL`, `region=IL`.
2. Free-shipping chip wrapper has `aria-checked="true"` after click.
3. Result count is reported (including the case `0`, which is meaningful — tells the user nothing on AE ships free for this query right now).
4. Caveat block about customs/VAT is included in the output.
